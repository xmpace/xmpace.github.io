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
    var specifiedWidth = thisImg.attr("width");
    var specifiedHeight = thisImg.attr("height");

    if (!specifiedHeight && !specifiedWidth) {
      var imgWidth = thisImg.prop("width");
      var maxWidth = $(".ym-post__content--custom").innerWidth();
      var bestWidth = imgWidth / 2 > maxWidth ? maxWidth : imgWidth / 2;
      thisImg.prop("width", bestWidth);
    }
  });

  
})
