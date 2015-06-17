# Meteor-without-blocking-the-rendering-process
Instructions on serving Meteor without blocking the rendering process

## The Idea

The Idea is to utilitize the [Server-Side Rendering package](https://github.com/meteorhacks/meteor-ssr) and the core package [WebApp](https://github.com/meteor/meteor/tree/devel/packages/webapp) to achive this.

## Execution

### Generating the HTML to serve

For this we'll need to `meteor add meteorhacks:ssr`.

First, we'll generate the HTML which will be Served using `WebApp`. Generating `SSR` Templates is a little different from normal ones. First of all the template files will only be located on the Server. They will be retrieved using `Assets.getText` so they have to be in the `private` directory.

_private/templates/example.html_

```
<h1>Say Hi!</h1>
<p>Hey {{ name }}. :O</p>
```

_private/templates/main.html_

```
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hi...</title>
</head>
<body>
  {{{ getTemplate "example" }}}
</body>
</html>
```

Notice that there are no `template`-tages wrapped around our templates. that's because we don't want meteor to use these as templates. An important part is also the call to the `getTemplate` helper. We can't use the standard `>` here, because the templates we want to import aren't normal Blaze template instances. So we define a helper:

_server/lib/templateHelpers.js_

```
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
```

So now we can reder the main template:

_server/main.js_

```
SSR.compileTemplate('sayHi', Assets.getText('example.html'))
var renderedHTML = SSR.render('sayHi', {name: 'Jude'})
```

This is just a very simple and not very practical example. For further infos on the usage of `SSR`, check out [it's repo](https://github.com/meteorhacks/meteor-ssr).

### Serving the HTML

Now we can simply use `WebApp` to server the generated HTML.

_server/main.js_

```
var renderedHTML = getTemplate.call({name: 'Jude'}, 'main')

WebApp.connectHandlers.use('/', function (req, res, next) {
  res.end(renderedHTML)
})
```
