$(function () {
  $('[data-toggle="tooltip"]').tooltip();

  $(".ym-post__content--custom img").each(function(idx) {
    var thisImg = $(this);
    // 图片标题
    thisImg.after(function() {
      return "<div align=\"center\" class=\"img-text\">" + this.alt + "</div>";
    });

    // 默认居中
    if (!thisImg.attr("align")) {
      thisImg.wrap("<div align=\"center\"></div>");
    }

    // mac retina的图片默认缩小1倍
    var os = thisImg.attr("os") || "win";
    thisImg[0].onload = function() {
      var specifiedWidth = thisImg.attr("width");
      var specifiedHeight = thisImg.attr("height");
  
      if (!specifiedHeight && !specifiedWidth) {
        var imgWidth = thisImg.prop("naturalWidth");
        var maxWidth = $(".ym-post__content--custom").innerWidth();
        if (os === 'mac') {
          imgWidth = imgWidth / 2;
        }
        var bestWidth = imgWidth > maxWidth ? maxWidth : imgWidth;
        thisImg.prop("width", bestWidth);
      }
    }

    // trigger img onload event
    thisImg.prop("src", thisImg.prop("src"));
  });

  if ($("#gitalk-container").length > 0) {
    const gitalk = new Gitalk({
      clientID: '95ce8cff68f8fca34fea',
      clientSecret: '48eb16fdf70e5668ecfddf4d211cdab1df231318',
      repo: 'xmpace.github.io',
      owner: 'xmpace',
      admin: ['xmpace'],
      perPage: 50,
      id: location.pathname,      // Ensure uniqueness and length less than 50
      distractionFreeMode: false  // Facebook-like distraction free mode
    });
    gitalk.render('gitalk-container');
  }
})
