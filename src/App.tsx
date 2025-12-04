import React from 'react'
import { hot } from 'react-hot-loader/root'
import { Route, Switch, Redirect } from 'react-router-dom'
import { useLookerFields } from './hooks/useLookerFields'
import AgentPage from './pages/AgentPage'

const ExploreApp = () => {
  // load dimensions and measures into the state
  useLookerFields()

  return (
    <>
        <Switch>
          <Route path="/index" exact>
              <AgentPage />
          </Route>
          <Route>
            <Redirect to="/index" />
          </Route>
        </Switch>
    </>
  )
}

export const App = hot(ExploreApp)
