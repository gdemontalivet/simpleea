import React, { useState, useEffect } from 'react'
import { Modal, Box, Typography, Switch, TextField, Button, Select, MenuItem, FormControl, InputLabel } from '@mui/material'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../../store'
import {
  setSetting,
  AssistantState,
  resetExploreAssistant,
  setLLMProvider,
  setLLMModel,
  LLMProvider,
} from '../../slices/assistantSlice'
import { safeStorage } from '../../utils/safeStorage'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const dispatch = useDispatch()
  const { settings } = useSelector(
    (state: RootState) => state.assistant as AssistantState,
  )

  const [provider, setProvider] = useState<LLMProvider>('gemini')
  const [modelName, setModelName] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)

  useEffect(() => {
    // Load existing settings when modal opens
    if (open) {
      const storedProvider = safeStorage.getItem('llm_provider') as LLMProvider
      if (storedProvider) {
        setProvider(storedProvider)
        dispatch(setLLMProvider(storedProvider))
      }

      const storedModel = safeStorage.getItem('llm_model')
      if (storedModel) {
        setModelName(storedModel)
        dispatch(setLLMModel(storedModel))
      }
    }
  }, [open, dispatch])

  const handleToggle = (id: string) => {
    dispatch(
      setSetting({
        id,
        value: !settings[id].value,
      }),
    )
  }

  const handleProviderChange = (newProvider: LLMProvider) => {
    setProvider(newProvider)
  }

  const handleSaveSettings = () => {
    // Save Provider
    safeStorage.setItem('llm_provider', provider)
    dispatch(setLLMProvider(provider))

    // Save Model
    if (modelName.trim()) {
      safeStorage.setItem('llm_model', modelName.trim())
      dispatch(setLLMModel(modelName.trim()))
    } else {
      safeStorage.removeItem('llm_model')
      dispatch(setLLMModel(''))
    }

    setApiKeySaved(true)
    setTimeout(() => setApiKeySaved(false), 2000)
  }

  const handleReset = () => {
    dispatch(resetExploreAssistant())
    setInterval(() => {
      window.location.reload()
    }, 100)
  }

  if (!settings) return null

  const getProviderLink = () => {
    switch(provider) {
      case 'openai': return 'https://platform.openai.com/api-keys'
      case 'anthropic': return 'https://console.anthropic.com/settings/keys'
      default: return 'https://ai.google.dev/'
    }
  }

  const getProviderName = () => {
    switch(provider) {
      case 'openai': return 'OpenAI'
      case 'anthropic': return 'Anthropic'
      default: return 'Gemini'
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="settings-modal-title"
      className="flex items-center justify-center"
    >
      <Box className="bg-white rounded-lg p-6 max-w-xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <Typography
          id="settings-modal-title"
          variant="h6"
          component="h2"
          className="mb-4"
        >
          Settings
        </Typography>

        {/* LLM Configuration Section */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <Typography variant="subtitle2" className="mb-2 font-semibold">
            LLM Configuration
          </Typography>
          
          <FormControl fullWidth size="small" className="mb-4" sx={{ mb: 2 }}>
            <InputLabel id="provider-select-label">LLM Provider</InputLabel>
            <Select
              labelId="provider-select-label"
              value={provider}
              label="LLM Provider"
              onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
            >
              <MenuItem value="gemini">Google Gemini</MenuItem>
              <MenuItem value="openai">OpenAI</MenuItem>
              <MenuItem value="anthropic">Anthropic Claude</MenuItem>
            </Select>
          </FormControl>

          <div className="flex gap-2">
             <TextField
              fullWidth
              size="small"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="Model Name (optional, e.g. gpt-4)"
              variant="outlined"
              helperText={`Default: ${provider === 'gemini' ? 'gemini-2.5-flash' : provider === 'openai' ? 'gpt-4' : 'claude-3-sonnet-20240229'}`}
            />
            <Button
              variant="contained"
              onClick={handleSaveSettings}
              className="whitespace-nowrap h-10"
            >
              {apiKeySaved ? '✓ Saved' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Other Settings */}
        <Typography variant="subtitle2" className="mb-2 font-semibold">
          Display Options
        </Typography>
        <ul>
          {Object.entries(settings).map(([id, setting]) => (
            <li key={id} className="flex flex-row py-4 border-b">
              <div className="flex-grow pr-4">
                <div className="text-sm font-semibold">{setting.name}</div>
                <div className="text-xs text-gray-500">
                  {setting.description}
                </div>
              </div>
              <div className="">
                <Switch
                  edge="end"
                  onChange={() => handleToggle(id)}
                  checked={setting.value}
                  inputProps={{ 'aria-labelledby': `switch-${id}` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <div
          onClick={handleReset}
          className="flex justify-start text-xs text-blue-500 hover:text-blue-600 cursor-pointer hover:underline mt-4"
        >
          reset explore assistant
        </div>
      </Box>
    </Modal>
  )
}

export default SettingsModal
