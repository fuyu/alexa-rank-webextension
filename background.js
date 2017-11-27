"use strict";

// Update when background.js is run
var activeTabsPromise = browser.tabs.query({active: true, currentWindow: true});
activeTabsPromise.then((tabs) => {
  updateStatsForTab(tabs[0].id)
})

// Listen to events when tab is updated
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log("tabs.onUpdated", tabId, changeInfo, tab);
  if (tab.active) {
    updateStatsForTab(tabId)
  }
  //if (!changeInfo.url) {
  //  return;
  //}
  //var gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
  //gettingActiveTab.then((tabs) => {
  //  if (tabId == tabs[0].id) {
  //    restartAlarm(tabId);
  //  }
  //});
})

// Listen to events when new tab becomes active
browser.tabs.onActivated.addListener((activeInfo) => {
  console.log("tab.onActivated", activeInfo)
  //restartAlarm(activeInfo.tabId);
  updateStatsForTab(activeInfo.tabId)
});


function handleMessage(request, sender) {
  console.log("Received message:", request);
  if (request.message !== "get_alexa_stats") {
    return Promise.resolve({})
  }
  //console.log("sender: ", sender);
  //sendResponse({response: "Response from background script"});

  var tabId = request.tabId;
  var tabPromise = browser.tabs.get(tabId);
  return tabPromise.then(tab => {
    if (!tab.url || tab.url.match(/^about:/) !== null) {
      return Promise.resolve({})
    }
    else {
      var host = getHostnameFromUrl(tab.url)
      return getAlexaStatsCached(host)
    }
  })
}
browser.runtime.onMessage.addListener(handleMessage);


function updateStatsForTab(tabId) {
  var tabPromise = browser.tabs.get(tabId);
  return tabPromise.then(tab => {
    //console.log(tab);
    if (!tab.url || tab.url.match(/^about:/) !== null) {
      //console.log("Not webpage")
      browser.pageAction.hide(tabId);
    }
    else {
      var host = getHostnameFromUrl(tab.url)
      //console.log("host:", host)

      return getAlexaStatsCached(host).then(stats => {
        return getIconImageData(stats).then(imageData => {
          browser.pageAction.setIcon({
            imageData: imageData,
            tabId: tabId
          })
          browser.pageAction.show(tabId);
        })
      })
      .catch(error => {
        console.log(error)
        browser.pageAction.hide(tabId)
      })
    }
  })
}

function getIconImageData(stats) {
  var imageWidth = 32;
  var imageHeight = 32;
  var markerSize = 8;
  var font = "16pt Arial";
  var rank = parseInt(stats.rank);

  if (isNaN(rank)) {
    return Promise.reject("Invalid rank")
  }

  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');

  var addText = (ctx, text, centerX, centerY) => {
    ctx.font = font;
    ctx.fillStyle = "black";
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    var maxWidth = imageWidth
    ctx.fillText(text, centerX, centerY, maxWidth);
  }

  var addMarker = (ctx, centerX, centerY, size) => {
    var radius = size / 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, false);
    ctx.fillStyle = "rgb(94, 94, 94)";
    ctx.fill();
  }

  var shortTextForNumber = (number) => {
    if (number < 1000) {
      return number.toString()
    }
    else if (number < 10000) {
      return (Math.floor(number / 100) / 10).toString()
    }
    else if (number < 1000000) {
      return Math.floor(number / 1000).toString()
    }
    else {
      return Math.floor(number / 1000000).toString()
    }
  }

  var textOffset = rank > 999 ? -4 : +2; // trying to align text beautifully here
  var text = shortTextForNumber(rank)
  addText(ctx, text, imageWidth / 2, imageHeight / 2 + textOffset)

  if (rank > 999999) {
    addMarker(ctx, imageWidth / 2 - 5, imageHeight - markerSize / 2, markerSize)
    addMarker(ctx, imageWidth / 2 + 5, imageHeight - markerSize / 2, markerSize)
  }
  else if (rank > 999) {
    addMarker(ctx, imageWidth / 2, imageHeight - markerSize / 2, markerSize)
  }

  return new Promise((resolve, reject) => {
    try {
      var imageData = ctx.getImageData(0, 0, imageWidth, imageHeight);
      //console.log("image data:", imageData);
      resolve(imageData)
    }
    catch (e) {
      reject(e)
    }
  })
}

/*
On page action click, navigate the corresponding tab to the cat gifs.
*/
browser.pageAction.onClicked.addListener(() => {
  console.log("clicked");
  browser.tabs.update({url: CATGIFS});
});



function getHostnameFromUrl(url) {
  var a = document.createElement("a");
  a.href = url;
  return a.hostname;
}


var alexaCache = {};
function getAlexaStatsCached(host) {
  var stats = alexaCache[host];
  if (stats) {
    console.log("Got Alexa stats from cache:", stats)
    return Promise.resolve(stats)
  }
  else {
    return getAlexaStatsFromApi(host).then(stats => {
      console.log("Got Alexa stats from api:", stats)
      alexaCache[host] = stats
      return stats
    })
  }
}


function getAlexaStatsFromApi(host) {
  return new Promise((resolve, reject) => {
    var url = "http://xml.alexa.com/data?cli=10&dat=nsa&url=" + host;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true); // true for asynchronous
    xhr.onreadystatechange = () => {
      if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {
        //console.log(xhr.responseText);
        var responseXML = xhr.responseXML;
        var rootElement = responseXML.documentElement;

        if (!rootElement || "parseerror" == rootElement.tagName) {
          reject("Alexa info unavailable");
          return
        }

        var popularityTag   = rootElement.getElementsByTagName('POPULARITY')[0];
        var reachTag        = rootElement.getElementsByTagName('REACH')[0];
        var rankTag         = rootElement.getElementsByTagName('RANK')[0];
        var countryTag      = rootElement.getElementsByTagName('COUNTRY')[0];

        if (!popularityTag) {
          reject("Alexa info parse error")
          return
        }

        var stats = {
          rank:         popularityTag.getAttribute('TEXT'),
          reach:        reachTag ? reachTag.getAttribute('RANK') : null,
          rankDelta:    rankTag ? rankTag.getAttribute('DELTA') : null,
          countryCode:  countryTag ? countryTag.getAttribute('CODE') : null,
          countryName:  countryTag ? countryTag.getAttribute('NAME') : null,
          countryRank:  countryTag ? countryTag.getAttribute('RANK') : null
        }
        resolve(stats)
      }
      else if (xhr.readyState == XMLHttpRequest.DONE) {
        reject("Request failed")
      }
    }
    xhr.send();
  })
}
