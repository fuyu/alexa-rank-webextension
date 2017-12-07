function saveOptions(e) {
  console.log("saving options", e)
  console.log(browser)
  browser.storage.local.set({
    "addressbar_text_color": document.querySelector("#addressbar_text_color").value
  });
  e.preventDefault();
}

function restoreOptions() {
  // See:
  // https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/storage/StorageArea/get
  var optionsPromise = browser.storage.local.get("addressbar_text_color");
  optionsPromise.then(options => {
    console.log("Restore options:", options)
    document.querySelector("#addressbar_text_color").value = options.addressbar_text_color || "#444";
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
