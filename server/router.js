Router.route('/test', {
  action: function () {
    altboiler.set({
      showLoader: false
    })
    this.response.end(Assets.getText('templates/example.html'))
  },
  where: 'server'
})


