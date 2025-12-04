import { useContext, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  AssistantState,
  SemanticModel,
  setIsSemanticModelLoaded,
  setSemanticModels,
  setAvailableExplores,
  AvailableExplore,
  setCurrenExplore,
} from '../slices/assistantSlice'
import { RootState } from '../store'
import { ExtensionContext } from '@looker/extension-sdk-react'
import { useErrorBoundary } from 'react-error-boundary'
import { safeStorage } from '../utils/safeStorage'

export const useLookerFields = () => {
  const {
    isSemanticModelLoaded,
    currentExplore,
  } = useSelector((state: RootState) => state.assistant as AssistantState)

  const dispatch = useDispatch()
  const { showBoundary } = useErrorBoundary()

  const { core40SDK, extensionSDK } = useContext(ExtensionContext)

  // Create a ref to track if the hook has already been called
  const hasFetched = useRef(false)

  // Auto-discover all available explores from Looker
  useEffect(() => {
    // if the hook has already been called, return
    if (hasFetched.current) return

    // if the semantic model is already loaded, return
    if (isSemanticModelLoaded) {
      return
    }
    
    // mark as fetched
    hasFetched.current = true

    const discoverExplores = async () => {
      try {
        // Check and log API key configuration on startup
        const provider = safeStorage.getItem('llm_provider') || 'gemini'
        let storedKey = safeStorage.getItem(`${provider}_api_key`)
        
        if (storedKey) {
          console.log(`✅ ${provider} API key found in localStorage`)
        } else {
          // Check User Attributes if not in localStorage
          try {
            const userAttributeKey = await extensionSDK.userAttributeGetItem(
              `${provider}_api_key`,
            )
            if (userAttributeKey) {
              console.log(`✅ ${provider} API key found in User Attributes`)
              storedKey = userAttributeKey
            } else {
              console.log(
                `⚠️ No ${provider} API key found in localStorage or User Attributes. Please configure in Settings.`,
              )
            }
          } catch (e) {
            console.warn('Could not check User Attributes for API key', e)
            console.log(
              `⚠️ No ${provider} API key found in localStorage. Please configure in Settings.`,
            )
          }
        }
        
        console.log('Fetching all available models and explores from Looker...')
        
        // Fetch all LookML models
        const models = await core40SDK.ok(
          core40SDK.all_lookml_models({
            fields: 'name,explores'
          })
        )

        if (!models || models.length === 0) {
          console.warn('No models found in Looker instance')
          dispatch(setIsSemanticModelLoaded(true))
          return
        }

        // Build list of all available explores
        const allExplores: AvailableExplore[] = []
        
        models.forEach((model) => {
          if (model.explores && model.explores.length > 0) {
            model.explores.forEach((explore) => {
              if (explore.name && explore.hidden !== true) {
                allExplores.push({
                  modelName: model.name || '',
                  exploreId: explore.name,
                  exploreKey: `${model.name}:${explore.name}`,
                  label: explore.label || explore.name
                })
              }
            })
          }
        })

        console.log(`Found ${allExplores.length} explores across ${models.length} models`)
        
        if (allExplores.length === 0) {
          console.warn('No explores found in any models')
          dispatch(setIsSemanticModelLoaded(true))
          return
        }

        // Store available explores in state
        dispatch(setAvailableExplores(allExplores))

        // Set first explore as default if none is set
        if (!currentExplore.exploreKey && allExplores.length > 0) {
          const firstExplore = allExplores[0]
          dispatch(setCurrenExplore({
            modelName: firstExplore.modelName,
            exploreId: firstExplore.exploreId,
            exploreKey: firstExplore.exploreKey
          }))
        }

        // Mark as loaded (we'll load semantic models on-demand when user selects an explore)
        dispatch(setIsSemanticModelLoaded(true))
        
      } catch (error) {
        console.error('Error discovering explores:', error)
        showBoundary({
          message: 'Failed to discover explores from Looker. Please check your permissions.',
        })
      }
    }

    discoverExplores()
  }, [])

  // Load semantic model for the currently selected explore
  useEffect(() => {
    if (!currentExplore.exploreKey || !isSemanticModelLoaded) {
      return
    }

    const loadSemanticModelForCurrentExplore = async () => {
      const { modelName, exploreId, exploreKey } = currentExplore
      
      if (!modelName || !exploreId) {
        return
      }

      try {
        console.log(`Loading semantic model for ${exploreKey}...`)
        
        const response = await core40SDK.ok(
          core40SDK.lookml_model_explore({
            lookml_model_name: modelName,
            explore_name: exploreId,
            fields: 'fields',
          }),
        )

        const { fields } = response

        if (!fields || !fields.dimensions || !fields.measures) {
          console.warn(`No fields found for ${exploreKey}`)
          return
        }

        const dimensions = fields.dimensions
          .filter(({ hidden }: any) => !hidden)
          .map(({ name, type, label, description, tags }: any) => ({
            name,
            type,
            label,
            description,
            tags,
          }))

        const measures = fields.measures
          .filter(({ hidden }: any) => !hidden)
          .map(({ name, type, label, description, tags }: any) => ({
            name,
            type,
            label,
            description,
            tags,
          }))

        const semanticModel: SemanticModel = {
          exploreId,
          modelName,
          exploreKey,
          dimensions,
          measures,
        }

        // Update semantic models with this explore's data
        dispatch(setSemanticModels({
          [exploreKey]: semanticModel
        }))

        console.log(`✅ Loaded ${dimensions.length} dimensions and ${measures.length} measures for ${exploreKey}`)
        
      } catch (error: any) {
        // Handle API errors gracefully - these are expected when explores aren't accessible
        // LookerSDKError might have status in different properties
        const status = error?.status || error?.response?.status || error?.statusCode
        const errorMessage = error?.message || String(error)
        
        // Check if it's a 404 (not found) or 403 (forbidden) error
        const is404 = status === 404 || status === '404' || 
                     errorMessage.toLowerCase().includes('404') || 
                     errorMessage.toLowerCase().includes('not found')
        
        const isPermission = status === 403 || status === '403' ||
                            errorMessage.toLowerCase().includes('403') || 
                            errorMessage.toLowerCase().includes('forbidden')
        
        // Log warning but don't break the app - user can select another explore
        if (is404 || isPermission || !status) {
          // These are expected errors - some explores may not be accessible
          console.warn(`⚠️ Could not load explore ${exploreKey}. This explore may not exist or you may not have permission. Please select a different explore from the dropdown.`)
        } else {
          // Unexpected error
          console.error(`❌ Unexpected error loading semantic model for ${exploreKey}:`, error)
        }
        
        // Don't show error boundary - allow user to continue and select another explore
        // This is normal behavior when some explores aren't accessible
      }
    }

    loadSemanticModelForCurrentExplore()
  }, [currentExplore.exploreKey, isSemanticModelLoaded])
}
