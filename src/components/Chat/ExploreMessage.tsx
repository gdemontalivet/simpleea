import React, { useState } from 'react'

import Message from './Message'
import { useContext } from 'react'
import { ExtensionContext } from '@looker/extension-sdk-react'
import { useDispatch } from 'react-redux'

import { ExploreParams, setQuery, setIsChatMode } from '../../slices/assistantSlice'
import { ExploreHelper } from '../../utils/ExploreHelper'
import { VisualizationEmbed } from '../VisualizationEmbed'

import { OpenInNew } from '@material-ui/icons'

interface ExploreMessageProps {
  exploreId: string
  modelName: string
  prompt: string
  exploreParams: ExploreParams
}

const ExploreMessage = ({ modelName, exploreId, prompt, exploreParams }: ExploreMessageProps) => {
  const dispatch = useDispatch()
  const { extensionSDK } = useContext(ExtensionContext)

  const exploreHref = `/explore/${modelName}/${exploreId}?${ExploreHelper.exploreQueryArgumentString(exploreParams)}&toggle=vis,data`
  
  const openExplore = () => {
    extensionSDK.openBrowserWindow(exploreHref, '_blank')
  }


  // Generate conversational response message
  const getResponseMessage = () => {
    return "Here's what I found based on your question:"
  }

  // Generate follow-up question suggestions
  const getFollowUpSuggestions = () => {
    const fields = exploreParams.fields || []
    const hasTimeDimension = fields.some(f => f.includes('date') || f.includes('time') || f.includes('month') || f.includes('year'))
    const hasMeasure = fields.some(f => f.includes('count') || f.includes('total') || f.includes('sum') || f.includes('average'))
    
    const suggestions = []
    
    // Time-based suggestions
    if (hasTimeDimension) {
      suggestions.push("Show me the trend over time")
      suggestions.push("Compare this to last year")
    }
    
    // Measure-based suggestions
    if (hasMeasure) {
      suggestions.push("What are the top 10 results?")
      suggestions.push("Break this down by category")
    }
    
    // General suggestions
    suggestions.push("Add more filters to this analysis")
    suggestions.push("Show me the details")
    
    // Return max 3 suggestions
    return suggestions.slice(0, 3)
  }

  return (
    <>
      <Message actor="system" createdAt={Date.now()}>
        <div>
          <div className="mb-3 text-gray-700">{getResponseMessage()}</div>
          
          {/* Embedded Visualization Only */}
          <div className="mt-3 mb-3 border border-gray-200 rounded-lg overflow-hidden shadow-sm" style={{ height: '500px' }}>
            <VisualizationEmbed
              modelName={modelName}
              exploreId={exploreId}
              exploreParams={exploreParams}
            />
          </div>

          {/* Action button */}
          <div className="flex flex-row gap-3 mb-4 text-sm">
            <button
              className="px-3 py-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors flex items-center gap-1"
              onClick={openExplore}
            >
              <OpenInNew fontSize={'small'} />
              <span>Open in Explore</span>
            </button>
          </div>

          {/* Follow-up suggestions */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600 mb-2">You might also want to ask:</div>
            <div className="flex flex-wrap gap-2">
              {getFollowUpSuggestions().map((suggestion, index) => (
                <button
                  key={index}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
                  onClick={() => {
                    dispatch(setIsChatMode(true))
                    dispatch(setQuery(suggestion))
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Message>

    </>
  )
}

export default ExploreMessage
