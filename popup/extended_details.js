"use strict";

var activeTabsPromise = browser.tabs.query({active: true, currentWindow: true});
activeTabsPromise.then((tabs) => {
  var tabId = tabs[0].id

  return browser.runtime.sendMessage({
    message: "get_alexa_stats",
    tabId: tabId
  })
  .then(stats => {
    //console.log("Response:", stats)

    var menu = document.querySelector(".panel-section-list")

    var getListItem = (textElement) => {
      var item = document.createElement("div");
      var icon = document.createElement("div");
      var text = document.createElement("div");
      item.className = "panel-list-item";
      icon.className = "icon";
      text.className = "text";
      text.append(textElement);
      item.append(icon);
      item.append(text);
      return item
    }

    var item1 = getListItem("Alexa rank: " + formatNumber(stats.rank));
    menu.append(item1);

    if (stats.countryName) {
      var span1 = document.createElement("span");
      var span2 = document.createElement("span");
      span2.append("Country: " + stats.countryName + " ");
      span1.append(span2)
      if (stats.countryCode) {
        var image = new Image(16, 11);
        image.src = "https://www.alexa.com/images/flags/" + stats.countryCode.toLowerCase() + ".png";
        span1.append(image)
      }
      //var item2 = getListItem("Country: " + stats.countryName);
      var item2 = getListItem(span1);
      menu.append(item2);
    }

    if (stats.countryRank) {
      var item3 = getListItem("Country rank: " + formatNumber(stats.countryRank));
      menu.append(item3);
    }
  })
  .catch(e => {
    console.log("Response error:", e)
  })
})

function formatNumber(number) {
  var formatter = new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 0
  })
  return formatter.format(number)
}
