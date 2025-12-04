project_name: "simpleexplorassis"

application: explore_assistant {
  label: "Explore Assistant"
  file: "bundle.js"
  entitlements: {
    core_api_methods: [
      "lookml_model_explore",
      "all_lookml_models",
      "create_query",
      "run_query",
      "me",
      "all_dashboards",
      "create_dashboard",
      "dashboard",
      "create_dashboard_element",
      "create_scheduled_plan",
      "all_user_attributes"
    ]
    navigation: yes
    use_embeds: yes
    use_iframes: yes
    new_window: yes
    new_window_external_urls: ["https://generativelanguage.googleapis.com/*", "https://api.openai.com/*"]
    local_storage: yes
    external_api_urls: ["https://generativelanguage.googleapis.com/*", "https://api.openai.com/*"]
    global_user_attributes: ["llm_model", "api_key"]
  }
}
