import { ExtensionContext } from '@looker/extension-sdk-react'
import { useCallback, useContext } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../store'
import { useErrorBoundary } from 'react-error-boundary'
import { AssistantState } from '../slices/assistantSlice'
import { safeStorage } from '../utils/safeStorage'
import { DashboardHelper } from '../utils/DashboardHelper'

import looker_filter_doc from '../documents/looker_filter_doc.md'
import looker_visualization_doc from '../documents/looker_visualization_doc.md'
import looker_filters_interval_tf from '../documents/looker_filters_interval_tf.md'
import looker_pivots_url_parameters_doc from '../documents/looker_pivots_url_parameters_doc.md'

import { ExploreParams } from '../slices/assistantSlice'
import { ExploreFilterValidator, FieldType } from '../utils/ExploreFilterHelper'

const parseJSONResponse = (jsonString: string | null | undefined) => {
  if (typeof jsonString !== 'string') {
    return {}
  }

  if (jsonString.startsWith('```json') && jsonString.endsWith('```')) {
    jsonString = jsonString.slice(7, -3).trim()
  }

  try {
    const parsed = JSON.parse(jsonString)
    return typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    return {}
  }
}

function formatRow(field: {
  name?: string
  type?: string
  label?: string
  description?: string
  tags?: string[]
}) {
  const name = field.name || ''
  const type = field.type || ''
  const label = field.label || ''
  const description = field.description || ''
  const tags = field.tags ? field.tags.join(', ') : ''
  return `| ${name} | ${type} | ${label} | ${description} | ${tags} |`
}

const getDefaultModel = () => {
  return 'gemini-2.5-flash'
}

const determineProvider = (model: string): 'gemini' | 'openai' => {
  // Determine provider based on model name
  if (model.startsWith('gpt-') || model.startsWith('o1-')) {
    return 'openai'
  }
  return 'gemini'
}

const useAssistantChat = () => {
  const { showBoundary } = useErrorBoundary()
  const { core40SDK, extensionSDK } = useContext(ExtensionContext)
  
  const { examples, currentExplore, semanticModels } = useSelector(
    (state: RootState) => state.assistant as AssistantState,
  )

  const currentExploreKey = currentExplore.exploreKey
  const exploreRefinementExamples =
    examples.exploreRefinementExamples[currentExploreKey]

  const getConfig = async () => {
    // Get model from User Attribute
    let model: string = getDefaultModel()
    
    try {
      const userAttributeModel = await extensionSDK.userAttributeGetItem('llm_model')
      if (userAttributeModel) {
        model = userAttributeModel
        console.log(`✅ LLM model loaded from User Attributes: ${model}`)
      }
    } catch (error) {
      console.error('Error fetching llm_model user attribute:', error)
    }

    // Determine provider based on model name
    const provider = determineProvider(model)
    console.log(`🤖 Using provider: ${provider} with model: ${model}`)

    // Get API Key from User Attribute
    let apiKey: string | null = null
    
    try {
      const userAttributeKey = await extensionSDK.userAttributeGetItem('api_key')
      if (userAttributeKey) {
        apiKey = userAttributeKey
        console.log(`✅ API key loaded from User Attributes`)
      } else {
        console.warn(`⚠️ api_key not found in User Attributes.`)
      }
    } catch (error) {
      console.error('Error fetching api_key user attribute:', error)
    }
    
    if (!apiKey) {
      throw new Error(`API key not configured. Please set the 'api_key' user attribute in Looker.`)
    }
    
    return { provider, model, apiKey }
  }

  const callGemini = async (apiKey: string, model: string, prompt: string) => {
    // Note: Model name in URL for Gemini
    // Allow overriding endpoint but default to model path
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    
    const response = await fetch(
      `${endpoint}?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    )
    
    if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`)
    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  const callOpenAI = async (apiKey: string, model: string, prompt: string) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`)
    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  }

  const callLLM = async (prompt: string): Promise<string> => {
    const { provider, model, apiKey } = await getConfig()
    
    if (provider === 'openai') {
      return callOpenAI(apiKey, model, prompt)
    } else {
      return callGemini(apiKey, model, prompt)
    }
  }

  const summarizePrompts = useCallback(
    async (promptList: string[]) => {
      const contents = `
      Primer
      ----------
      A user is iteractively asking questions to generate an explore URL in Looker. The user is refining his questions by adding more context. The additional prompts he is adding could have conflicting or duplicative information: in those cases, prefer the most recent prompt. 

      Here are some example prompts the user has asked so far and how to summarize them:

${exploreRefinementExamples &&
        exploreRefinementExamples
          .map((item) => {
            const inputText = '"' + item.input.join('", "') + '"'
            return `- The sequence of prompts from the user: ${inputText}. The summarized prompts: "${item.output}"`
          })
          .join('\n')
        }

      Conversation so far
      ----------
      input: ${promptList.map((prompt) => '"' + prompt + '"').join('\n')}
    
      Task
      ----------
      Summarize the prompts above to generate a single prompt that includes all the relevant information. If there are conflicting or duplicative information, prefer the most recent prompt.

      Only return the summary of the prompt with no extra explanatation or text
      `
      
      return await callLLM(contents)
    },
    [exploreRefinementExamples],
  )

  const promptWrapper = (prompt: string) => {
    const currentDate = new Date().toLocaleString()
    return `The current date is ${currentDate}
    
    ${prompt}`
  }

  const generateSharedContext = (dimensions: any[], measures: any[], exploreGenerationExamples: any[]) => {
    if (!dimensions.length || !measures.length) {
      showBoundary(new Error('Dimensions or measures are not defined'))
      return ''
    }
    
    let exampleText = ''
    if (exploreGenerationExamples && exploreGenerationExamples.length > 0) {
      exampleText = exploreGenerationExamples
        .map((item) => `input: "${item.input}" ; output: ${JSON.stringify(item.output)}`)
        .join('\n')
    }
    
    return `
      # Documentation
      Here is general documentation about filters:
        ${looker_filter_doc}
      Here is general documentation on how intervals and timeframes are applied in Looker
       ${looker_filters_interval_tf}   
      Here is general documentation on visualizations:
       ${looker_visualization_doc}
      Here is general documentation on Looker JSON fields and pivots
       ${looker_pivots_url_parameters_doc}
             
      ## Format of query object
      
      | Field              | Type   | Description                                                                                                                                                                                                                                                                          |
      |--------------------|--------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
      | model              | string | Model                                                                                                                                                                                                                                                                                |
      | view               | string | Explore Name                                                                                                                                                                                                                                                                         |
      | vis_config         | object | Visualization config. MUST include 'type'. Valid types: looker_column, looker_bar, looker_line, looker_pie, looker_area, looker_scatter, single_value, looker_grid. |
      | fields             | string[] | Fields                                                                                                                                                                                                                                                                                |
      | pivots             | string[] | Pivots                                                                                                                                                                                                                                                                                |
      | fill_fields        | string[] | Fill Fields                                                                                                                                                                                                                                                                           |
      | filters            | object | Filters                                                                                                                                                                                                                                                                               |
      | filter_expression  | string | Filter Expression                                                                                                                                                                                                                                                                     |
      | sorts              | string[] | Sorts                                                                                                                                                                                                                                                                                 |
      | limit              | string | Limit                                                                                                                                                                                                                                                                                 |
      | column_limit       | string | Column Limit                                                                                                                                                                                                                                                                          |
      | total              | boolean | Total                                                                                                                                                                                                                                                                                 |
      | row_total          | string | Raw Total                                                                                                                                                                                                                                                                             |
      | subtotals          | string[] | Subtotals                                                                                                                                                                                                                                                                             |
      | vis_config         | object | Visualization configuration properties. |
      | filter_config      | object | The filter_config represents the state of the filter UI on the explore page for a given query. |
          
      # End Documentation
      
      # Metadata
      This information is particular to the current Looker instance and data model. The fields below can be used in the response.
      Model: ${currentExplore.modelName}
      Explore: ${currentExplore.exploreId}
      
      Dimensions Used to group by information (follow the instructions in tags when using a specific field; if map used include a location or lat long dimension;):
      
      | Field Id | Field Type | LookML Type | Label | Description | Tags |
      |------------|------------|-------------|-------|-------------|------|
      ${dimensions.map(formatRow).join('\n')}
                
      Measures are used to perform calculations (if top, bottom, total, sum, etc. are used include a measure):
      
      | Field Id | Field Type | LookML Type | Label | Description | Tags |
      |------------|------------|-------------|-------|-------------|------|
      ${measures.map(formatRow).join('\n')}
      # End LookML Metadata
    
      # Example 
        Examples Below include the fields, filters and sometimes visualization configs. 
        They were taken at a different date. ALL DATE RANGES ARE WRONG COMPARING TO CURRENT DATE.
        (BE CAREFUL WITH DATES, DO NOT OUTPUT THE Examples 1:1, as changes could happen with timeframes and date ranges)
        ${exampleText}
      # End Examples
    `
  }

  const determineIntent = async (prompt: string) => {
    const contents = `
      Primer
      ----------
      A user is interacting with an agent that is translating questions to a structured URL query. You are a very smart observer that will look at one such question and determine the user's intent.
  
      Task
      ----------
      Determine if the user is:
      1. Asking for a data summary (e.g. "summarize the data", "explain this")
      2. Asking to save/add to a dashboard (e.g. "add to dashboard Sales", "save as New Dashboard")
      3. Asking to schedule a report (e.g. "schedule daily to user@example.com")
      4. Asking to refine an existing visualization (e.g., "make it a bar chart", "change the color to red")
      5. Asking a new data question / refining the query (e.g. "show revenue", "filter by year")
      
      The user said:
      ${prompt}

      Output
      ----------
      Return a JSON object with the following format:
      {
        "intent": "summary" | "dashboard" | "schedule" | "refine" | "explore",
        "meta": {
          "title": string, // For dashboard intent: the dashboard title
          "action": "create" | "add", // For dashboard intent
          "email": string, // For schedule intent
          "frequency": string // For schedule intent (e.g. "daily", "weekly")
        }
      }
      
      Only return the JSON object.
    `
    
    const response = await callLLM(contents)
    return parseJSONResponse(response)
  }

  const summarizeExplore = useCallback(
    async (exploreParams: ExploreParams) => {
      // Sanitize filters: convert arrays to strings and remove empty values
      const filters: Record<string, string> = {}
      if (exploreParams.filters) {
        Object.entries(exploreParams.filters).forEach(([key, value]) => {
          if (!value) return
          
          if (typeof value === 'string' && value.trim()) {
            filters[key] = value
          } else if (Array.isArray(value)) {
            // Filter out empty strings and join with comma (Looker's OR separator)
            const validFilters = value.filter(f => f && typeof f === 'string' && f.trim())
            if (validFilters.length > 0) {
              filters[key] = validFilters.join(',')
            }
          }
        })
      }

      let sanitizedParams: ExploreParams = {
        ...exploreParams,
        filters: filters,
      }

      // Validate fields against semantic model to prevent 422 errors
      const semanticModel = semanticModels[currentExploreKey]
      if (semanticModel) {
        const validFieldNames = new Set([
          ...semanticModel.dimensions.map(d => d.name),
          ...semanticModel.measures.map(m => m.name)
        ])

        const validFields = (sanitizedParams.fields || []).filter(f => validFieldNames.has(f))
        
        if (validFields.length !== (sanitizedParams.fields?.length || 0)) {
          const removed = sanitizedParams.fields?.filter(f => !validFieldNames.has(f))
          console.warn('⚠️ Removed invalid fields from query:', removed)
        }

        // Validate sorts
        const validSorts = (sanitizedParams.sorts || []).filter(s => {
          const fieldName = s.split(' ')[0] // "field_name desc" -> "field_name"
          return validFieldNames.has(fieldName)
        })

        sanitizedParams = {
          ...sanitizedParams,
          fields: validFields,
          sorts: validSorts
        }
      }

      console.log('Creating query with params:', {
        model: currentExplore.modelName,
        view: currentExplore.exploreId,
        ...sanitizedParams
      })

      const createQuery = await DashboardHelper.createQuery(
        core40SDK,
        currentExplore.modelName,
        currentExplore.exploreId,
        sanitizedParams
      )

      const queryId = createQuery.id
      if (queryId === undefined || queryId === null) {
        return 'There was an error!!'
      }
      
      const result = await core40SDK.ok(
        core40SDK.run_query({
          query_id: queryId,
          result_format: 'md',
        }),
      )

      if (result.length === 0) {
        return 'There was an error!!'
      }

      const contents = `
      Data
      ----------
      ${result}
      
      Task
      ----------
      Summarize the data above
      `
      
      const response = await callLLM(contents)

      const refinedContents = `
      The following text represents summaries of a given dashboard's data. 
      Summaries: ${response}

      Make this much more concise for a slide presentation using the following format. The summary should be a markdown document that contains a list of sections, each section should have the following details: a section title, which is the title for the given part of the summary, and key points which a list of key points for the concise summary. Data should be returned in each section, you will be penalized if it doesn't adhere to this format. Each summary should only be included once. Do not include the same summary twice.
      `

      const refinedResponse = await callLLM(refinedContents)
      return refinedResponse
    },
    [currentExplore],
  )

  const generateFilterParams = useCallback(
    async (prompt: string, sharedContext: string, dimensions: any[], measures: any[]) => {
      const filterContents = `
      ${sharedContext}
      
      # Instructions
      
      The user asked the following question:
      
      \`\`\`
      ${prompt}
      \`\`\`
      
      Your job is to follow the steps below and generate a JSON object.
      
      * Step 1: Your task is the look at the following data question that the user is asking and determine the filter expression for it. You should return a JSON list of filters to apply. Each element in the list will be a pair of the field id and the filter expression. Your output will look like \`[ { "field_id": "example_view.created_date", "filter_expression": "this year" } ]\`
      * Step 2: verify that you're only using valid expressions for the filter values. If you do not know what the valid expressions are, refer to the table above. If you are still unsure, don't use the filter.
      * Step 3: verify that the field ids are indeed Field Ids from the table. If they are not, you should return an empty dictionary. There should be a period in the field id.
      `

      const filterResponseInitial = await callLLM(filterContents)
      const filterResponseCheckJSON = parseJSONResponse(filterResponseInitial)

      const filterResponseArray = Array.isArray(filterResponseCheckJSON) ? filterResponseCheckJSON : []
      const filterResponseJSON: any = {}

      filterResponseArray.forEach(function (filter: {
        field_id: string
        filter_expression: string
      }) {
        const field =
          dimensions.find((d) => d.name === filter.field_id) ||
          measures.find((m) => m.name === filter.field_id)

        if (!field) {
          console.log(`Invalid field: ${filter.field_id}`)
          return
        }

        const isValid = ExploreFilterValidator.isFilterValid(
          field.type as FieldType,
          filter.filter_expression,
        )

        if (!isValid) {
          console.log(
            `Invalid filter expression for field ${filter.field_id}: ${filter.filter_expression}`,
          )
          return
        }

        if (!filterResponseJSON[filter.field_id]) {
          filterResponseJSON[filter.field_id] = []
        }
        filterResponseJSON[filter.field_id].push(filter.filter_expression)
      })

      return filterResponseJSON
    },
    [],
  )

  const generateBaseExploreParams = useCallback(
    async (prompt: string, sharedContext: string) => {
      const currentDateTime = new Date().toISOString()

      const contents = `
      ${sharedContext}
      
      Output
      ----------
      
      Return a JSON that is compatible with the Looker API run_inline_query function as per the spec. Here is an example:
      
      {
        "model":"${currentExplore.modelName}",
        "view":"${currentExplore.exploreId}",
        "fields":["category.name","inventory_items.days_in_inventory_tier","products.count"],
        "filters":{"category.name":"socks"},
        "sorts":["products.count desc 0"],
        "limit":"500",
        "vis_config": { "type": "looker_column" }
      }
      
      Instructions:
      - DO NOT add a model or a view, this is not needed in the response.
      - Determine the best visualization type (vis_config.type) based on the user's request and data. You MUST choose a type from the "Valid Visualization Types" list in the documentation provided above. Default to 'looker_grid' if unsure.
      - choose only the fields in the below lookml metadata
      - prioritize the field description, label, tags, and name for what field(s) to use for a given description
      - generate only one answer, no more.
      - use the Examples for guidance on how to structure the body
      - try to avoid adding dynamic_fields, provide them when very similar example is found in the bottom
      - Always use the provided current date (${currentDateTime}) when generating Looker URL queries that involve TIMEFRAMES.
      - only respond with a JSON object
        
      User Request
      ----------
      ${prompt}
      `

      const response = await callLLM(contents)
      const responseJSON = parseJSONResponse(response)

      return responseJSON
    },
    [currentExplore],
  )

  const generateExploreParams = useCallback(
    async (
      prompt: string,
      dimensions: any[],
      measures: any[],
      exploreGenerationExamples: any[],
    ) => {
      if (!dimensions.length || !measures.length) {
        showBoundary(new Error('Dimensions or measures are not defined'))
        return
      }
      
      const sharedContext = generateSharedContext(dimensions, measures, exploreGenerationExamples) || ''
      const filterResponseJSON = await generateFilterParams(prompt, sharedContext, dimensions, measures)
      const responseJSON = await generateBaseExploreParams(prompt, sharedContext)

      responseJSON['filters'] = filterResponseJSON

      // Validate fields against dimensions and measures
      const validFieldNames = new Set([
        ...dimensions.map(d => d.name),
        ...measures.map(m => m.name)
      ])

      if (responseJSON.fields) {
        const originalFields = responseJSON.fields
        responseJSON.fields = originalFields.filter((f: string) => validFieldNames.has(f))
        
        if (responseJSON.fields.length !== originalFields.length) {
          const removed = originalFields.filter((f: string) => !validFieldNames.has(f))
          console.warn('⚠️ Removed invalid fields generated by LLM:', removed)
        }
      }

      if (responseJSON.sorts) {
        responseJSON.sorts = responseJSON.sorts.filter((s: string) => {
          const fieldName = s.split(' ')[0]
          return validFieldNames.has(fieldName)
        })
      }

      return responseJSON
    },
    [],
  )

  const sendMessage = async (message: string) => {
    const wrappedMessage = promptWrapper(message)
    try {
      const response = await callLLM(wrappedMessage)
      return response
    } catch (error) {
      showBoundary(error)
      return ''
    }
  }

  const refineVisConfig = useCallback(
    async (
      prompt: string,
      currentVisConfig: { [key: string]: any },
      exploreParams: ExploreParams,
      dimensions: any[],
      measures: any[],
    ) => {
      const contents = `
      # Task
      You are an expert in Looker's visualization configuration. Your task is to modify an existing visualization config JSON based on a user's request.
      - You must only modify the properties relevant to the user's request.
      - You must return a complete, valid JSON object.
      - Do not change the chart 'type' unless explicitly asked to.

      # Context
      Here is the existing visualization config:
      \`\`\`json
      ${JSON.stringify(currentVisConfig, null, 2)}
      \`\`\`

      Here are the fields being used in the query, which may be relevant for applying colors to specific series:
      - Dimensions: ${exploreParams.fields
        ?.filter((f) => !exploreParams.pivots?.includes(f))
        .join(', ')}
      - Pivots: ${exploreParams.pivots?.join(', ')}
      - Measures: ${exploreParams.fields
        ?.filter(
          (f) =>
            !dimensions.some((d: any) => d.name === f) &&
            !measures.some((m: any) => m.name === f),
        )
        .join(', ')}

      # User Request
      "${prompt}"

      # Output
      Return only the modified, complete JSON object for the new visualization config.
      `

      const response = await callLLM(contents)
      const responseJSON = parseJSONResponse(response)
      return responseJSON
    },
    [],
  )

  return {
    generateExploreParams,
    generateBaseExploreParams,
    generateFilterParams,
    sendMessage,
    summarizePrompts,
    determineIntent,
    summarizeExplore,
    refineVisConfig,
  }
}

export default useAssistantChat
