const moddableProxy = require("@moddable/pebbleproxy");
const Clay = require("@rebble/clay");
const clayConfig = require("./config");
const clay = new Clay(clayConfig);

function sendError(errorMessage) {
  Pebble.sendAppMessage(
    {
      STATUS: 1,
      ERROR: errorMessage,
    },
    function () {
      console.log("Sent error to watch: " + errorMessage);
    },
    function (err) {
      console.log("Failed to send error: " + JSON.stringify(err));
    }
  );
}

function sendPrices(count, base, pricesStr) {
  Pebble.sendAppMessage(
    {
      STATUS: 0,
      COUNT: count,
      BASE: base,
      PRICES: pricesStr,
    },
    function () {
      console.log("Sent prices to watch: count=" + count);
    },
    function (err) {
      console.log("Failed to send prices: " + JSON.stringify(err));
    }
  );
}

function fetchAndSend(region) {
  var url =
    "https://api.spot-hinta.fi/TodayAndDayForward?region=" +
    encodeURIComponent(region) +
    "&priceResolution=60";
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.timeout = 15000;
  xhr.ontimeout = function () {
    sendError("Request timeout");
  };
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200) {
      sendError("HTTP " + xhr.status);
      return;
    }
    try {
      var data = JSON.parse(xhr.responseText);
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Empty response");
      }

      var now = new Date();
      var currentHourStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        0,
        0,
        0
      );
      var currentHourTime = currentHourStart.getTime();

      var futureItems = [];
      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        if (!item || !item.DateTime) continue;
        var dt = new Date(item.DateTime);
        if (isNaN(dt.getTime())) continue;
        var itemHourStart = new Date(
          dt.getFullYear(),
          dt.getMonth(),
          dt.getDate(),
          dt.getHours(),
          0,
          0,
          0
        );
        if (itemHourStart.getTime() >= currentHourTime) {
          futureItems.push(item);
        }
      }

      if (futureItems.length === 0) {
        throw new Error("No future data");
      }

      var base = Math.floor(new Date(futureItems[0].DateTime).getTime() / 1000);
      var encoded = [];
      for (var j = 0; j < futureItems.length; j++) {
        var p = futureItems[j].PriceWithTax;
        if (p == null) {
          encoded.push("");
        } else {
          encoded.push(String(Math.round(p * 10000)));
        }
      }

      sendPrices(futureItems.length, base, encoded.join(","));
    } catch (e) {
      sendError(e.message);
    }
  };
  xhr.onerror = function () {
    sendError("Network error");
  };
  xhr.send();
}

Pebble.addEventListener("ready", moddableProxy.readyReceived);

Pebble.addEventListener("appmessage", function (e) {
  if (moddableProxy.appMessageReceived(e)) {
    return;
  }

  var payload = e.payload;
  if (payload.REQUEST === 1) {
    var region = payload.REGION;
    if (!region) {
      sendError("Missing region");
      return;
    }
    fetchAndSend(region);
  }
});
