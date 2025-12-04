# Simplified Looker Explore Assistant

A simplified Looker extension that uses the Gemini API to transform natural language questions into Looker explore URLs.

![explore assistant](./static/explore-assistant.gif)

## Description

The Explore Assistant allows users to generate Looker Explore queries via natural language. Simply enter your Gemini API key and ask questions in plain English - the extension will automatically:

1. Fetch metadata about your Looker models and explores
2. Send your question along with the metadata to the Gemini API
3. Generate a valid Looker explore URL
4. Provide a clickable link to open the explore in Looker

### Key Features

- ✅ **No Backend Required** - Direct API calls from browser to Gemini
- ✅ **Simple Setup** - Just install dependencies and run
- ✅ **Minimal Dependencies** - Only essential packages included
- ✅ **Easy to Customize** - Clean, simple codebase
- ✅ **Secure** - API key stored only in browser session memory
- **Model and Explore selection dropdowns** - No need to recompile!
- **LocalStorage persistence** - Your settings are saved in the browser
- **Add to Dashboard** - Save generated explores directly to Looker dashboards

### Technologies Used

- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Looker Extension SDK](https://github.com/looker-open-source/sdk-codegen/tree/main/packages/extension-sdk-react)
- [Google Gemini API](https://ai.google.dev/)

## Quick Start

### Prerequisites

1. A Looker instance with admin access to install extensions
2. Node.js (version 14-16)
3. A Gemini API key (get one at https://ai.google.dev/)

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/gdemontalivet/simpleea.git
   cd simpleea
   ```

2. Install dependencies:
   ```bash
   npm install
   ```
   
   > **Note:** If you encounter npm authentication issues, create a `.npmrc` file with:
   > ```
   > registry=https://registry.npmjs.org/
   > ```

3. Start the development server:
   ```bash
   npm start
   ```

4. The extension will be available at `https://localhost:8080/bundle.js`

### Configure in Looker

1. In your Looker instance, go to **Admin > Platform > Extensions**
2. Create a new extension project or use an existing one
3. Update the `manifest.lkml` file to point to your development server
4. Deploy the extension

## LLM Configuration via User Attributes

### Benefits of User Attribute Configuration

- **Centralized Management**: Admins can set the configuration once for all users
- **No Manual Entry**: Users don't need to configure anything individually
- **Easy Updates**: Change the model or API key in one place when needed
- **Consistent Experience**: All users use the same LLM configuration

### Setup Steps

#### 1. Create User Attributes (Admin Only)

Navigate to **Admin → Users → User Attributes** and create the following attributes:

##### a. LLM Model Attribute

1. Click **New User Attribute**
2. Configure:
   - **Name**: `llm_model`
   - **Label**: `LLM Model`
   - **Data Type**: `String`
   - **User Access**: `View`
   - **Default Value**: `gemini-2.5-flash` (or `gpt-4`, `gpt-4o`, `gpt-3.5-turbo`, etc.)
3. Click **Save**

##### b. API Key Attribute

1. Click **New User Attribute**
2. Configure:
   - **Name**: `api_key`
   - **Label**: `API Key`
   - **Data Type**: `String`
   - **User Access**: `View` (or `None` for security)
   - **Hide Values**: `Yes` (recommended for security)
   - **Default Value**: Your API key (Gemini or OpenAI)
3. Click **Save**

#### 2. Set User Attribute Values

You have two options for setting values:

##### Option A: Organization-Wide Defaults
Set the **Default Value** in each user attribute configuration (Step 1 above). This will apply to all users.

##### Option B: Per User or Group

**For Users:**
1. Go to **Admin → Users → Users**
2. Select a user
3. Click **Edit**
4. Find the **User Attributes** section
5. Set values for `llm_model` and `api_key`
6. Click **Save**

**For Groups:**
1. Go to **Admin → Users → Groups**
2. Select a group
3. Click **Edit**
4. Find the **User Attributes** section
5. Set values for `llm_model` and `api_key`
6. Click **Save**

#### 3. Verify the Extension Configuration

Make sure the extension's `manifest.lkml` includes the user attribute entitlements:

```lkml
application: explore_assistant {
    label: "Explore Assistant"
    file: "bundle.js"
    entitlements: {
      core_api_methods: ["lookml_model_explore","all_lookml_models","me"]
      navigation: yes
      use_embeds: yes
      use_iframes: yes
      new_window: yes
      new_window_external_urls: [
        "https://generativelanguage.googleapis.com/*",
        "https://api.openai.com/*"
      ]
      local_storage: yes
      external_api_urls: [
        "https://generativelanguage.googleapis.com/*",
        "https://api.openai.com/*"
      ]
      global_user_attributes: [
        "llm_model",
        "api_key"
      ]
    }
}
```

## Usage

1. Open the Explore Assistant extension in Looker
2. Enter your Gemini API key (saved in browser - you only need to enter it once)
3. **Select your Model** from the dropdown menu
4. **Select your Explore** from the dropdown menu
5. Type your question in natural language, such as:
   - "Show me total sales by category for this year"
   - "What are the top 10 products by revenue?"
   - "Display customer count by region, sorted by count"
6. Click "Generate Looker URL"
7. Review the generated URL and click "Open in Looker" to view the results
8. **NEW:** Click "add to dashboard" to save the explore as a tile on any dashboard

**All your settings (API key, model, and explore selections) are automatically saved in your browser!**

### Adding Explores to Dashboards

Once an explore is generated, you can:
- Click the **"add to dashboard"** button
- Choose an existing dashboard from your Looker instance
- Or create a new dashboard on the fly
- The explore will be automatically converted to a query and added as a tile

This feature uses the Looker SDK to:
1. Create a persistent query from the explore parameters
2. Add it as a visualization tile to your selected dashboard
3. Position it automatically below existing tiles

## How It Works

1. **Model Discovery**: On load, the extension fetches all available models and explores from your Looker instance
2. **User Configuration**: You select which model and explore to work with (selections are saved in browser)
3. **Metadata Retrieval**: When you ask a question, the extension fetches the dimensions and measures for your selected explore
4. **Prompt Construction**: Your question is combined with the metadata to create a detailed prompt
5. **Gemini API Call**: The prompt is sent to Google's Gemini API for processing
6. **URL Generation**: The Gemini response is parsed and converted into a valid Looker explore URL
7. **Navigation**: You can click the generated URL to open the explore in Looker

### Why This Approach?

- **Deploy Once, Configure Anywhere**: No need to recompile the extension for different models/explores
- **User Flexibility**: Each user can work with different models/explores without affecting others
- **Persistent Configuration**: Your settings are saved locally, so you don't have to reconfigure every time

## Deployment

To build for production:

```bash
npm run build
```

This creates a `dist/bundle.js` file that you can:
- Host on a web server
- Upload to Looker's extension framework
- Deploy to any static file hosting service

## Security

- API keys are stored only in browser session memory
- No server-side storage or logging
- Direct communication with Gemini API only
- All Looker API calls use the extension SDK's built-in authentication

## Troubleshooting

### 422 Validation Error Analysis

**Error Details**
```
Failed to load resource: the server responded with a status of 422
Error creating query: LookerSDKError: Validation Failed
```

**Root Cause**

The 422 error occurs when calling `core40SDK.create_query()` in the `summarizeExplore` function. This is a **Looker API validation error** indicating the query parameters don't meet the API's requirements.

### "Could not establish connection. Receiving end does not exist"

**Error Message:**
```
Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist.
```

**Cause:**
This is a harmless browser console warning that occurs when the embedded Looker iframe tries to communicate with browser extensions. 

**Solution:**
This warning can be safely ignored. It's a known behavior of embedded iframes and doesn't indicate any problem with the extension.

### "Cannot find module" errors
Run: `npm install`

### Authentication issues
Check your npm registry configuration in `.npmrc`

### CORS errors when calling Gemini
Make sure you're using a valid API key from https://ai.google.dev/

### No models or explores found
Verify your Looker user has access to at least one model/explore

### Extension Not Entitled to Use API Method

**Error Messages:**
```
Extension not entitled to use api method all_dashboards
Extension not entitled to use api method create_dashboard
Extension not entitled to use api method create_dashboard_element
```

**Cause:**
The extension's manifest doesn't have the required API permissions, or you're using an old version of the extension that was deployed before the dashboard features were added.

**Solution:**
1. Ensure the `manifest.lkml` file includes these API methods in the `core_api_methods` list:
   - `all_dashboards`
   - `create_dashboard`
   - `dashboard`
   - `create_dashboard_element`

2. Rebuild the extension:
   ```bash
   npm run build
   ```

3. Redeploy the updated `bundle.js` to your Looker instance

4. Refresh the extension in your browser

## Getting Your API Key

1. Visit [https://ai.google.dev/](https://ai.google.dev/)
2. Sign in with your Google account
3. Click "Get API Key"
4. Copy your API key
5. Enter it in the extension (it will be saved in localStorage)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0.
