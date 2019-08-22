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

  
})
