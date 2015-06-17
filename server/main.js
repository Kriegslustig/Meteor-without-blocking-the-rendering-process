
var renderedHTML = getTemplate.call({name: 'Jude'}, 'main')

WebApp.connectHandlers.use('/', function (req, res, next) {
  res.end(renderedHTML)
})
