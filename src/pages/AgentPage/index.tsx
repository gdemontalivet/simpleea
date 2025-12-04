import React, { useCallback, useEffect, useRef, useState, useContext } from 'react'
import PromptInput from './PromptInput'
import Sidebar from './Sidebar'
import { v4 as uuidv4 } from 'uuid'

import './style.css'
import SamplePrompts from '../../components/SamplePrompts'
import { RootState } from '../../store'
import { useDispatch, useSelector } from 'react-redux'
import useAssistantChat from '../../hooks/useAssistantChat'
import { ExtensionContext } from '@looker/extension-sdk-react'
import { DashboardHelper } from '../../utils/DashboardHelper'
import {
  addMessage,
  AssistantState,
  setCurrenExplore,
  setIsQuerying,
  setQuery,
  updateCurrentThread,
  updateLastHistoryEntry,
} from '../../slices/assistantSlice'
import MessageThread from './MessageThread'
import {
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  SelectChangeEvent,
} from '@mui/material'
import { getRelativeTimeString } from '../../utils/time'

const toCamelCase = (input: string): string => {
  // Remove underscores, make following letter uppercase
  let result = input.replace(
    /_([a-z])/g,
    (_match, letter) => ' ' + letter.toUpperCase(),
  )

  // Capitalize the first letter of the string
  result = result.charAt(0).toUpperCase() + result.slice(1)

  return result
}

const AgentPage = () => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null) // Ref for the last message
  const dispatch = useDispatch()
  const { core40SDK } = useContext(ExtensionContext)
  const [expanded, setExpanded] = useState(false)
  const {
    generateExploreParams,
    determineIntent,
    summarizePrompts,
    refineVisConfig,
  } = useAssistantChat()

  const {
    isChatMode,
    query,
    isQuerying,
    currentExploreThread,
    currentExplore,
    examples,
    semanticModels,
    isSemanticModelLoaded,
    availableExplores,
  } = useSelector((state: RootState) => state.assistant as AssistantState)

  const scrollIntoView = useCallback(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [endOfMessagesRef])

  useEffect(() => {
    scrollIntoView()
  }, [currentExploreThread, query, isQuerying])

  useEffect(() => {
    const fetchUserAttributes = async () => {
      try {
        const currentUser = await core40SDK.ok(
          core40SDK.me('user_attributes, can')
        )
        console.log(
          'User Attributes:',
          (currentUser as any).user_attributes,
          'Can see all user attributes:',
          (currentUser as any).can
        )
      } catch (error) {
        console.error('Error fetching user attributes:', error)
      }
    }
    fetchUserAttributes()
  }, [core40SDK])

  const submitMessage = useCallback(async () => {
    if (query === '') {
      return
    }

    try {
    dispatch(setIsQuerying(true))

    // update the prompt list
    let promptList = [query]
    if (currentExploreThread && currentExploreThread.promptList) {
      promptList = [...currentExploreThread.promptList, query]
    }

    dispatch(
      updateCurrentThread({
        promptList,
      }),
    )

    const exploreKey =
      currentExploreThread?.exploreKey || currentExplore.exploreKey

    // set the explore if it is not set
    if (!currentExploreThread?.modelName || !currentExploreThread?.exploreId) {
      dispatch(
        updateCurrentThread({
          exploreId: currentExplore.exploreId,
          modelName: currentExplore.modelName,
          exploreKey: currentExplore.exploreKey,
        }),
      )
    }

    console.log('Prompt List: ', promptList)
    console.log(currentExploreThread)
    console.log(currentExplore)

    dispatch(
      addMessage({
        uuid: uuidv4(),
        message: query,
        actor: 'user',
        createdAt: Date.now(),
        type: 'text',
      }),
    )

    const [promptSummary, intentResponse] = await Promise.all([
      summarizePrompts(promptList),
      determineIntent(query),
    ])

    const intent = intentResponse.intent
    const meta = intentResponse.meta

    if (!promptSummary) {
      dispatch(setIsQuerying(false))
      return
    }

    // Check if semantic model is loaded for this explore
    const semanticModel = semanticModels[exploreKey]
    if (!semanticModel || !semanticModel.dimensions || !semanticModel.measures) {
      console.error(`Semantic model not loaded for explore: ${exploreKey}`)
      dispatch(setIsQuerying(false))
      dispatch(
        addMessage({
          uuid: uuidv4(),
          message: `⚠️ The semantic model for this explore is not loaded yet. Please wait a moment and try again, or select a different explore.`,
          actor: 'system',
          createdAt: Date.now(),
          type: 'text',
        }),
      )
      return
    }

    const { dimensions, measures } = semanticModel
    const exploreGenerationExamples =
      examples.exploreGenerationExamples[exploreKey]

    const newExploreParams = await generateExploreParams(
      promptSummary,
      dimensions,
      measures,
      exploreGenerationExamples,
    )
    
    // TODO: move this logic to the slice
    // delete the model and view from the newExploreParams
    if (newExploreParams.model) {
      delete newExploreParams.model
    }
    if (newExploreParams.view) {
      delete newExploreParams.view
    }

    console.log('New Explore URL: ', newExploreParams)

    // Manual correction for a common LLM error
    if (newExploreParams.vis_config?.type === 'looker_single_value') {
      newExploreParams.vis_config.type = 'single_value'
    }
    
    // Handle Dashboard Intent
    if (intent === 'dashboard') {
      const { title, action } = meta
      console.log('Dashboard Intent:', { title, action })
      let dashboardId = ''
      
      if (action === 'create') {
        const dashboard = await DashboardHelper.createDashboard(core40SDK, title || 'New Dashboard')
        dashboardId = dashboard.id!
        await DashboardHelper.addExploreToDashboard(core40SDK, dashboardId, currentExplore.modelName, currentExplore.exploreId, newExploreParams, title || 'New Tile')
        
        dispatch(addMessage({
          uuid: uuidv4(),
          message: `✅ Created new dashboard "[${title}](/dashboards/${dashboardId})" and added tile.`,
          actor: 'system',
          createdAt: Date.now(),
          type: 'markdown'
        }))
      } else {
        // Add to existing
        if (!title) {
          dispatch(addMessage({
            uuid: uuidv4(),
            message: `⚠️ Please specify the name of the dashboard you want to add this tile to.`,
            actor: 'system',
            createdAt: Date.now(),
            type: 'text'
          }))
          dispatch(setIsQuerying(false))
          dispatch(setQuery(''))
          return
        }

        const dashboards = await DashboardHelper.getUserDashboards(core40SDK)
        const targetDashboard = dashboards.find((d: any) => d.title.toLowerCase() === (title || '').toLowerCase())
        
        if (targetDashboard) {
          dashboardId = targetDashboard.id!
          await DashboardHelper.addExploreToDashboard(core40SDK, dashboardId, currentExplore.modelName, currentExplore.exploreId, newExploreParams, 'New Tile')
          dispatch(addMessage({
            uuid: uuidv4(),
            message: `✅ Added tile to dashboard "[${targetDashboard.title}](/dashboards/${dashboardId})".`,
            actor: 'system',
            createdAt: Date.now(),
            type: 'markdown'
          }))
        } else {
           dispatch(addMessage({
            uuid: uuidv4(),
            message: `⚠️ Could not find dashboard "${title}".`,
            actor: 'system',
            createdAt: Date.now(),
            type: 'text'
          }))
        }
      }
      
      dispatch(setIsQuerying(false))
      dispatch(setQuery(''))
      return
    }

    // Handle Schedule Intent
    if (intent === 'schedule') {
      const { email, frequency } = meta
      if (!email) {
        dispatch(
          addMessage({
            uuid: uuidv4(),
            message: `⚠️ Please provide an email address to schedule the report.`,
            actor: 'system',
            createdAt: Date.now(),
            type: 'text',
          }),
        )
      } else {
        const query = await DashboardHelper.createQuery(
          core40SDK,
          currentExplore.modelName,
          currentExplore.exploreId,
          newExploreParams,
        )
        await DashboardHelper.createScheduledPlan(
          core40SDK,
          query.id!.toString(),
          'Scheduled Report',
          email,
        )

        dispatch(
          addMessage({
            uuid: uuidv4(),
            message: `✅ Scheduled report to ${email} (${
              frequency || 'daily'
            }).`,
            actor: 'system',
            createdAt: Date.now(),
            type: 'text',
          }),
        )
      }

      dispatch(setIsQuerying(false))
      dispatch(setQuery(''))
      return
    }

    // Handle Refine Intent
    if (intent === 'refine') {
      const lastMessage =
        currentExploreThread?.messages[currentExploreThread.messages.length - 1]
      if (lastMessage && lastMessage.type === 'explore') {
        const lastExploreParams = lastMessage.exploreParams
        const currentVisConfig = lastExploreParams.vis_config || {}

        const newVisConfig = await refineVisConfig(
          query, // Pass the user's raw refinement prompt
          currentVisConfig,
          lastExploreParams,
          dimensions,
          measures,
        )

        if (Object.keys(newVisConfig).length > 0) {
          const refinedExploreParams = {
            ...lastExploreParams,
            vis_config: newVisConfig,
          }

          dispatch(
            addMessage({
              exploreParams: refinedExploreParams,
              uuid: uuidv4(),
              summarizedPrompt: 'Visualization updated',
              actor: 'system',
              createdAt: Date.now(),
              type: 'explore',
            }),
          )
        }
      } else {
        // Handle case where there is no previous visualization to refine
        dispatch(
          addMessage({
            uuid: uuidv4(),
            message: `I can't refine the visualization because there isn't one in the previous turn. Please ask a new question.`,
            actor: 'system',
            createdAt: Date.now(),
            type: 'text',
          }),
        )
      }

      dispatch(setIsQuerying(false))
      dispatch(setQuery(''))
      return
    }

    dispatch(setIsQuerying(false))
    dispatch(setQuery(''))

    dispatch(
      updateCurrentThread({
        exploreParams: newExploreParams,
        summarizedPrompt: promptSummary,
      }),
    )

    if (intent === 'summary') {
      dispatch(
        addMessage({
          exploreParams: newExploreParams,
          uuid: uuidv4(),
          actor: 'system',
          createdAt: Date.now(),
          summary: '',
          type: 'summarize',
        }),
      )
    } else {
      dispatch(
        addMessage({
          exploreParams: newExploreParams,
          uuid: uuidv4(),
          summarizedPrompt: promptSummary,
          actor: 'system',
          createdAt: Date.now(),
          type: 'explore',
        }),
      )
    }

    // scroll to bottom of message thread
    scrollIntoView()

    // update the history with the current contents of the thread
    dispatch(updateLastHistoryEntry())
    } catch (error: any) {
      console.error('Error submitting message:', error)
      dispatch(setIsQuerying(false))
      dispatch(
        addMessage({
          uuid: uuidv4(),
          message: `Error: ${error.message || 'Something went wrong'}`,
          actor: 'system',
          createdAt: Date.now(),
          type: 'text',
        }),
      )
    }
  }, [query, semanticModels, examples, currentExplore, currentExploreThread])

  // Check if semantic model for current explore is loaded
  const exploreKey = currentExploreThread?.exploreKey || currentExplore.exploreKey
  const currentSemanticModel = semanticModels[exploreKey]
  const isCurrentExploreModelLoaded = 
    isSemanticModelLoaded && 
    currentSemanticModel && 
    currentSemanticModel.dimensions && 
    currentSemanticModel.measures &&
    currentSemanticModel.dimensions.length > 0 &&
    currentSemanticModel.measures.length > 0

  useEffect(() => {
    if (!query || query === '' || !isCurrentExploreModelLoaded) {
      return
    }

    submitMessage()
    scrollIntoView()
  }, [query, isCurrentExploreModelLoaded])

  const toggleDrawer = () => {
    setExpanded(!expanded)
  }

  const handleExploreChange = (event: SelectChangeEvent) => {
    const exploreKey = event.target.value
    const [modelName, exploreId] = exploreKey.split(':')
    dispatch(
      setCurrenExplore({
        modelName,
        exploreId,
        exploreKey,
      }),
    )
  }

  const isAgentReady = isSemanticModelLoaded

  if (!isAgentReady) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="flex flex-col space-y-4 mx-auto max-w-2xl p-4">
          <h1 className="text-5xl font-bold">
            <span className="bg-clip-text text-transparent  bg-gradient-to-r from-pink-500 to-violet-500">
              Hello.
            </span>
          </h1>
          <h1 className="text-3xl text-gray-400">
            Getting everything ready...
          </h1>
          <div className="max-w-2xl text-blue-300">
            <LinearProgress color="inherit" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative page-container flex h-screen">
      <Sidebar expanded={expanded} toggleDrawer={toggleDrawer} />

      <main
        className={`flex-grow flex flex-col transition-all duration-300 ${
          expanded ? 'ml-80' : 'ml-16'
        } h-screen`}
      >
        <div className="flex-grow">
          {isChatMode && (
            <div className="z-10 flex flex-row items-start text-xs fixed inset w-full h-10 pl-2 bg-gray-50 border-b border-gray-200">
              <ol
                role="list"
                className="flex w-full max-w-screen-xl space-x-4 px-4 sm:px-6 lg:px-4"
              >
                <li className="flex">
                  <div className="flex items-center">Explore Assistant</div>
                </li>

                <li className="flex">
                  <div className="flex items-center h-10 ">
                    <svg
                      fill="currentColor"
                      viewBox="0 0 44 44"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                      className="h-full w-6 flex-shrink-0 text-gray-300"
                    >
                      <path d="M.293 0l22 22-22 22h1.414l22-22-22-22H.293z" />
                    </svg>
                    <div className="ml-4 text-xs font-medium text-gray-500 hover:text-gray-700">
                      {toCamelCase(currentExploreThread?.exploreId || '')}
                    </div>
                  </div>
                </li>

                <li className="flex">
                  <div className="flex items-center h-10">
                    <svg
                      fill="currentColor"
                      viewBox="0 0 44 44"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                      className="h-full w-6 flex-shrink-0 text-gray-300"
                    >
                      <path d="M.293 0l22 22-22 22h1.414l22-22-22-22H.293z" />
                    </svg>
                    <div className="ml-4 text-xs font-medium text-gray-500 hover:text-gray-700">
                      Chat (started{' '}
                      {getRelativeTimeString(
                        currentExploreThread?.createdAt
                          ? new Date(currentExploreThread.createdAt)
                          : new Date(),
                      )}
                      )
                    </div>
                  </div>
                </li>
              </ol>
            </div>
          )}
          {isChatMode ? (
            <div className="relative flex flex-col h-screen px-4 pt-6">
              <div className="flex-grow overflow-y-auto max-h-full mb-36">
                <div className="max-w-6xl mx-auto mt-8">
                  <MessageThread endOfMessageRef={endOfMessagesRef} />
                </div>
              </div>
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-4/5 transition-all duration-300 ease-in-out">
                <PromptInput />
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col space-y-4 mx-auto max-w-3xl p-4">
                <h1 className="text-5xl font-bold">
                  <span className="bg-clip-text text-transparent  bg-gradient-to-r from-pink-500 to-violet-500">
                    Hello.
                  </span>
                </h1>
                <h1 className="text-5xl text-gray-400">
                  How can I help you today?
                </h1>
              </div>

              <div className="flex flex-col max-w-3xl m-auto mt-16">
                {availableExplores.length > 1 && (
                  <div className="text-md border-b-2 p-2 max-w-3xl">
                    <FormControl className="w-full">
                      <InputLabel>Select Explore</InputLabel>
                      <Select
                        value={currentExplore.exploreKey}
                        label="Select Explore"
                        onChange={handleExploreChange}
                      >
                        {availableExplores.map((explore) => (
                          <MenuItem
                            key={explore.exploreKey}
                            value={explore.exploreKey}
                          >
                            {explore.label || toCamelCase(explore.exploreId)} ({explore.modelName})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </div>
                )}
                <SamplePrompts />
              </div>

              <div
                className={`fixed bottom-0 left-1/2 transform -translate-x-1/2 w-4/5 transition-all duration-300 ease-in-out
                            ${expanded ? 'pl-80' : ''} `}
              >
                <PromptInput />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default AgentPage
