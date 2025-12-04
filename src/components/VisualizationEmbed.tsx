/*

MIT License

Copyright (c) 2023 Looker Data Sciences, Inc.

Permission is hereby granted, free of charge, to to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

import React, { useContext, useEffect, useState } from 'react'
import styled from 'styled-components'
import { ExtensionContext } from '@looker/extension-sdk-react'
import { ExploreParams } from '../slices/assistantSlice'
import { DashboardHelper } from '../utils/DashboardHelper'
import { IWriteQuery } from '@looker/sdk'

export interface VisualizationEmbedProps {
  modelName: string
  exploreId: string
  exploreParams: ExploreParams
}

export const VisualizationEmbed = ({
  modelName,
  exploreId,
  exploreParams,
}: VisualizationEmbedProps) => {
  const { extensionSDK, core40SDK } = useContext(ExtensionContext)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const createQueryAndBuildUrl = async () => {
      if (!modelName || !exploreId) return
      setIsLoading(true)
      setError(null)
      try {
        const query = await DashboardHelper.createQuery(
          core40SDK,
          modelName,
          exploreId,
          exploreParams
        )

        const hostUrl = extensionSDK?.lookerHostData?.hostUrl
        const qid = query?.client_id

        if (hostUrl && qid) {
          const params = new URLSearchParams({
            sdk: '2',
            // embed_domain is not needed within the extension framework
            _theme: JSON.stringify({
              key_color: '#174ea6',
              background_color: '#f4f6fa',
            }),
          })
          const url = `${hostUrl}/embed/query-visualization/${qid}?${params.toString()}`
          setEmbedUrl(url)
        } else {
          throw new Error('Query creation response missing necessary data (client_id).')
        }
      } catch (err) {
        console.error('Error during query creation or URL build:', err)
        setError('Failed to load visualization')
      } finally {
        setIsLoading(false)
      }
    }
    createQueryAndBuildUrl()
  }, [core40SDK, modelName, exploreId, exploreParams, extensionSDK])

  return (
    <EmbedContainer>
      {isLoading && (
        <LoadingContainer>
          <div className="text-gray-500">Loading visualization...</div>
        </LoadingContainer>
      )}
      {error && (
        <ErrorContainer>
          <div className="text-red-500">{error}</div>
        </ErrorContainer>
      )}
      {!isLoading && !error && embedUrl && (
        <iframe
          src={embedUrl}
          title="Embedded Looker Visualization"
          frameBorder="0"
          className="looker-embed-iframe"
        />
      )}
    </EmbedContainer>
  )
}

const EmbedContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  > iframe {
    width: 100%;
    height: 100%;
    display: block;
    border: none;
  }
`

const LoadingContainer = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f7f7f7;
`

const ErrorContainer = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff5f5;
`
