Router.route('/test', {
  action: function () {
    console.log('test')
    altboiler.set({
      showLoader: false
    })
    this.response.end(Assets.getText('templates/example.html'))
  },
  where: 'server'
})
