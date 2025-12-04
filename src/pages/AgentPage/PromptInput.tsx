import { Send } from '@material-ui/icons'
import React, { useState, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../../store'
import { setIsChatMode, setQuery, AssistantState } from '../../slices/assistantSlice'
import clsx from 'clsx'

const PromptInput = () => {
  const dispatch = useDispatch()
  const [inputText, setInputText] = useState('')
  const inputRef = useRef(null)

  const { 
    isQuerying, 
    currentExplore, 
    currentExploreThread, 
    semanticModels,
    isSemanticModelLoaded 
  } = useSelector((state: RootState) => state.assistant as AssistantState)

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

  const handleInputChange = (e: any) => {
    setInputText(e.target.value)
  }

  const handleSubmit = useCallback(() => {
    const prompt = inputText.trim()
    if (prompt && !isQuerying) {
      dispatch(setIsChatMode(true))
      dispatch(setQuery(prompt))
    }

    if (!isQuerying) {
      setInputText('')
    }
  }, [isQuerying, inputText])

  const handleKeyPress = (e: any) => {
    if (e.key === 'Enter' && e.keyCode !== 229) {
      handleSubmit()
    }
  }
  const isDisabled = isQuerying || !isCurrentExploreModelLoaded
  const placeholderText = !isCurrentExploreModelLoaded 
    ? "Loading explore data..." 
    : "Enter a prompt here"

  return (
    <div className="max-w-3xl mx-auto px-8 pt-4 pb-2 bg-white bg-opacity-80 rounded-md">
      {!isCurrentExploreModelLoaded && (
        <div className="mb-2 text-xs text-amber-600 text-center bg-amber-50 py-2 px-4 rounded-md">
          ⏳ Loading semantic model for the selected explore. Please wait...
        </div>
      )}
      <div className="relative flex items-center bg-[rgb(240,244,249)] rounded-full p-2">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          disabled={isDisabled}
          placeholder={placeholderText}
          className={`flex-grow bg-transparent placeholder-gray-400 outline-none pl-4 ${
            isDisabled
              ? 'cursor-not-allowed text-gray-500'
              : 'cursor-text text-gray-800'
          }`}
        />
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSubmit}
            disabled={isDisabled}
            className={clsx("p-2 text-white  rounded-full transition-all duration-300 ease-in-out",
              inputText.trim() && !isDisabled ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400',
              isQuerying ? 'animate-spin' : ''
            )}
          >
            {isQuerying ? (
              <div className="w-5 h-5 border-t-2 border-white rounded-full animate-spin"></div>
            ) : (
              <Send />
            )}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 my-2 text-center">
        Gemini may display inaccurate info, including about people, so
        double-check its responses.
      </p>
    </div>
  )
}

export default PromptInput
