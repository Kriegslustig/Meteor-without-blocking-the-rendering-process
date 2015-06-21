if (Meteor.settings.approach === 'pushAndShove') {
  var state = 1
  if(state == 1) {
    state = 0
    WebApp.connectHandlers.use(function (req, res, next) {
      res.end(getTemplate.call(getTemplateData(), 'pushAndShove'))
    })

    function getTemplateData () {
      var data = {
        includes: getIncludes(WebApp.defaultArch),
        meteorRuntimeConfig: __meteor_runtime_config__ || {}
      }
      _.each(data, function (value, key) {
        data[key] = EJSON.stringify(value)
      })
      return data
    }

    function getIncludes (arch) {
      return WebApp.clientPrograms[arch].manifest.concat(parseStaticJS(WebAppInternals.additionalStaticJs))
    }

    function parseStaticJS (staticJsObj) {
      var returnArr = []
      _.each(staticJsObj, function (js, key) {
        returnArr.push({
          type: 'js',
          url: key
        })
      })
      return returnArr
    }
  }
}