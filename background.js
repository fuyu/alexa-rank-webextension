/*
 * Alexa rank webextension
 * Author: Maksym Stefanchuk <objectivem@gmail.com>
 * Date: 2017-12-05
 *
 */
"use strict";

// Update when background.js is run
var activeTabsPromise = browser.tabs.query({active: true, currentWindow: true});
Promise.all([activeTabsPromise, getOptions()]).then(res => {
  var tabs = res[0];
  var options = res[1];
  updateStatsForTab(tabs[0].id, options)
})

// Listen to events when tab is updated
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log("tabs.onUpdated", tabId, changeInfo, tab);
  if (tab.active) {
    return getOptions().then(options => updateStatsForTab(tabId, options))
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
  //updateStatsForTab(activeInfo.tabId)
  return getOptions().then(options => updateStatsForTab(activeInfo.tabId, options))
});

// Listen when options change
//browser.storage.onChanged.addListener((changedInfo) => {
//  console.log("options changed:", changedInfo)
//})


function shouldShowForUrl(url) {
  var servicePageRegex = new RegExp("^about:");
  var ipRegex = new RegExp("^http://\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}");
  var regexes = [servicePageRegex, ipRegex];
  if (!url) {
    return false
  }
  var matches = regexes.map(regex => regex.test(url))
  return matches.filter(m => m).length === 0
}

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
    if (!tab.url || !shouldShowForUrl(tab.url)) {
      return Promise.resolve({})
    }
    else {
      var host = getHostnameFromUrl(tab.url)
      return getAlexaStatsCached(host)
        .then(stats => {
          return Object.assign({}, stats, { host: host })
        })
    }
  })
}
browser.runtime.onMessage.addListener(handleMessage);


function updateStatsForTab(tabId, options) {
  var tabPromise = browser.tabs.get(tabId);
  return tabPromise.then(tab => {
    //console.log(tab);
    if (!tab.url || !shouldShowForUrl(tab.url)) {
      console.log("Not webpage")
      browser.pageAction.hide(tabId);
    }
    else {
      var host = getHostnameFromUrl(tab.url)
      //console.log("host:", host)

      return getAlexaStatsCached(host).then(stats => {
        return getIconImageData(stats, options).then(imageData => {
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

function getIconImageData(stats, options) {
  var imageWidth = 32;
  var imageHeight = 32;
  var markerSize = 8;
  var font = "bold 15pt 'Arial'";
  var rank = stats.rank !== null ? parseInt(stats.rank) : null;
  var color = options.addressbar_text_color ? options.addressbar_text_color : "#444";

  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');

  var addText = (ctx, text, centerX, centerY) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    var maxWidth = imageWidth
    ctx.fillText(text, centerX, centerY, maxWidth);
  }

  var shortTextForNumber = (number) => {
    if (number < 1000) {
      return number.toString()
    }
    else if (number < 100000) {
      return Math.floor(number / 1000).toString() + "k"
    }
    else if (number < 1000000) {
      return Math.floor(number / 100000).toString() + "hk"
    }
    else {
      return Math.floor(number / 1000000).toString() + "m"
    }
  }

  var textOffset = 2; // trying to align text beautifully here
  var text = rank !== null ? shortTextForNumber(rank) : "n/a";
  addText(ctx, text, imageWidth / 2, imageHeight / 2 + textOffset)

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


function getOptions() {
  return browser.storage.local.get("addressbar_text_color")
}


function getHostnameFromUrl(url) {
  var a = document.createElement("a");
  a.href = url;
  return a.hostname;
}


var alexaCache = {};
async function getAlexaStatsCached(host) {
  var stats = alexaCache[host];
  if (stats) {
    console.log("Got Alexa stats from cache:", stats)
    return Promise.resolve(stats)
  }
  else {
    var [xmlApiStats, xmlApiError] = await getAlexaStatsFromApi(host);
    if (xmlApiError) {
      console.log("Alexa XML API error:", xmlApiError);
      var [htmlApiStats, htmlApiError] = await getAlexaStatsFromHtml(host);
      if (htmlApiError) {
        console.log("Alexa HTML fetch error:", htmlApiError);
        return Promise.reject("Failed to get stats from Alexa");
      }
      else {
        alexaCache[host] = htmlApiStats;
        return htmlApiStats;
      }
    }
    else {
      alexaCache[host] = xmlApiStats;
      return xmlApiStats;
    }
  }
}

const ALEXA_XML_API_BLOCKED_ERROR = "ALEXA_XML_API_BLOCKED_ERROR";
const ALEXA_XML_API_UNAVAILANBLE_ERROR = "ALEXA_XML_API_UNAVAILANBLE_ERROR";

function getAlexaStatsFromApi(host) {
  return new Promise((resolve, reject) => {
    var url = "http://xml.alexa.com/data?cli=10&dat=nsa&url=" + host;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true); // true for asynchronous
    xhr.onreadystatechange = () => {
      if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {
        //console.log(xhr.responseText);

        if (xhr.responseXML === null || !xhr.responseXML.documentElement) {
          return resolve([null, {reason: ALEXA_XML_API_BLOCKED_ERROR}]);
        }

        var responseXML = xhr.responseXML;
        var rootElement = responseXML.documentElement;
        if ("parseerror" == rootElement.tagName) {
          return resolve([null, {reason: ALEXA_XML_API_UNAVAILANBLE_ERROR}]);
        }

        var popularityTag   = rootElement.getElementsByTagName('POPULARITY')[0];
        var reachTag        = rootElement.getElementsByTagName('REACH')[0];
        var rankTag         = rootElement.getElementsByTagName('RANK')[0];
        var countryTag      = rootElement.getElementsByTagName('COUNTRY')[0];

        if (!popularityTag) {
          return resolve([{ rank: null }, null])
        }

        var stats = {
          rank:         popularityTag.getAttribute('TEXT'),
          reach:        reachTag ? reachTag.getAttribute('RANK') : null,
          rankDelta:    rankTag ? rankTag.getAttribute('DELTA') : null,
          countryCode:  countryTag ? countryTag.getAttribute('CODE') : null,
          countryName:  countryTag ? countryTag.getAttribute('NAME') : null,
          countryRank:  countryTag ? countryTag.getAttribute('RANK') : null
        }
        resolve([stats, null])
      }
      else if (xhr.readyState == XMLHttpRequest.DONE) {
        reject("Request failed")
      }
    }
    xhr.send();
  })
}

function getAlexaStatsFromHtml(host) {
  console.log("getAlexaStatsFromHtml");

  return new Promise((resolve, reject) => {
    var url = "https://www.alexa.com/minisiteinfo/" + host;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true); // true for asynchronous
    xhr.onreadystatechange = () => {
      if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {
        //console.log(xhr.responseText);

        const findStatsTdElement = (tableElement, alexaStatsLabel) => {
          return Array.from(table.getElementsByTagName("td")).find(td => {
            return td.querySelector("div.label").textContent.trim().match(alexaStatsLabel) !== null
          })
        }

        const strToInt = (str) => {
          // Numbers are displayed as strings with delimeters (e.g. 123,564).
          return parseInt(str.trim().replace(/,/g, ""))
        }

        var html = new DOMParser().parseFromString(xhr.responseText, "text/html");
        const table = html.getElementById("siteStats");

        const globalRankStatsTd = findStatsTdElement(table, "Alexa Traffic Rank");
        const globalRank = globalRankStatsTd ? strToInt(globalRankStatsTd.querySelector("div.data a").textContent) : null;

        const countryStatsTd = findStatsTdElement(table, "Traffic Rank in");
        const countryRank = countryStatsTd ? strToInt(countryStatsTd.querySelector("div.data a").textContent) : null;
        const countryCode = countryStatsTd ? countryStatsTd.querySelector("div.label a").textContent.trim() : null;
        const countryName = countryStatsTd ? countryStatsTd.querySelector("div.label a").getAttribute("title").trim() : null;

        const sitesLinkingInStatsTd = findStatsTdElement(table, "Sites Linking In");
        const sitesLinkingIn = sitesLinkingInStatsTd ? strToInt(sitesLinkingInStatsTd.querySelector("div.data a").textContent) : null;

        var stats = {
          rank:         globalRank,
          reach:        null,
          rankDelta:    null,
          countryCode:  countryCode,
          countryName:  countryName,
          countryRank:  countryRank,
          linksCount:   sitesLinkingIn
        }
        console.log(stats);
        resolve([stats, null])
      }
      else if (xhr.readyState == XMLHttpRequest.DONE) {
        reject("Request failed")
      }
    }
    xhr.send();
  })
}
