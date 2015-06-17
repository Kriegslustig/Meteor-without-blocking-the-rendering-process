// A function that retrieves plain text templates from the private/templates directory
getRawTemplate = function getRawTemplate (templateName) {
  return Assets.getText('templates/' + templateName + '.html')
}

// Renders a template and returns HTML
// You can bind a context to it to use it as a context for the template
getTemplate = function getTemplate (templateName) {
  SSR.compileTemplate(templateName, getRawTemplate(templateName))
  return SSR.render(templateName, this)
}

// Register the getTemplate function as a helper
Template.registerHelper('getTemplate', getTemplate)
