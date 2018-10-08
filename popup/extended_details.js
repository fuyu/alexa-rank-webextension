/*
 * Alexa rank webextension
 * Author: Maksym Stefanchuk <objectivem@gmail.com>
 * Date: 2017-12-05
 *
 */
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

    var getListItem = (textElement, clickMethod) => {
      var item = document.createElement("div");
      var icon = document.createElement("div");
      var text = document.createElement("div");
      item.className = "panel-list-item";
      icon.className = "icon";
      text.className = "text";
      text.append(textElement);
      item.append(icon);
      item.append(text);
      if (clickMethod) {
        item.addEventListener("click", clickMethod)
      }
      return item
    }

    var rankFormatted = stats.rank !== null ? formatNumber(stats.rank) : "n/a";
    var item1 = getListItem("Alexa rank: " + rankFormatted, () => {
      window.open('https://www.alexa.com/siteinfo/' + stats.host, '_blank');
    });
	//browser.pageAction.setTitle({title: rankFormatted});
	
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
      var item2 = getListItem(span1,() => {
		window.open('https://www.alexa.com/siteinfo/' + stats.host, '_blank');
	  });
      menu.append(item2);
    }

    if (stats.countryRank) {
      var item3 = getListItem("Country rank: " + formatNumber(stats.countryRank),() => {
		window.open('https://www.alexa.com/siteinfo/' + stats.host, '_blank');
	  });
      menu.append(item3);
    }
	
    if (stats.linksCount) {
      var item4 = getListItem("Links: " + formatNumber(stats.linksCount),() => {
		window.open('https://www.alexa.com/siteinfo/' + stats.host, '_blank');
      });
      menu.append(item4);
    }

    //var item4 = getListItem("Options", () => {
    //  console.log("Go to options")
    //  return browser.runtime.openOptionsPage()
    //});
    //menu.append(item4);
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
