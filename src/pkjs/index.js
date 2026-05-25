const moddableProxy = require("@moddable/pebbleproxy");

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

function sendSettings(region, range) {
  Pebble.sendAppMessage(
    {
      SETTINGS: 1,
      REGION: region,
      RANGE: range,
    },
    function () {
      console.log("Sent settings to watch: region=" + region + ", range=" + range);
    },
    function (err) {
      console.log("Failed to send settings: " + JSON.stringify(err));
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
      sendError(e.message || "Parse error");
    }
  };
  xhr.onerror = function () {
    sendError("Network error");
  };
  xhr.send();
}

function getConfigUrl(region, range) {
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><title>Virta Settings</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;padding:16px;background:#111;color:#fff}h1{font-size:18px;text-align:center;margin:0 0 20px}.field{background:#222;border-radius:8px;padding:12px 16px;margin-bottom:12px}label{display:block;font-size:12px;color:#aaa;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}select,input[type=range]{width:100%;font-size:16px;background:#111;color:#fff;border:1px solid #444;border-radius:6px;padding:8px;box-sizing:border-box}select{appearance:none;-webkit-appearance:none}.range-value{text-align:center;font-size:18px;margin-top:6px;font-weight:600}.buttons{display:flex;gap:12px;margin-top:20px}button{flex:1;font-size:16px;padding:12px;border:none;border-radius:8px;font-weight:600;cursor:pointer}.save{background:#0a0;color:#fff}.cancel{background:#444;color:#fff}</style></head><body><h1>Virta Settings</h1><div class="field"><label for="region">Region</label><select id="region"></select></div><div class="field"><label for="range">Cheapest Window</label><input type="range" id="range" min="1" max="24"><div class="range-value" id="rangeValue"></div></div><div class="buttons"><button class="cancel" onclick="cancel()">Cancel</button><button class="save" onclick="save()">Save</button></div><script>var regions=[{c:"DK1",n:"DK1 West"},{c:"DK2",n:"DK2 East"},{c:"EE",n:"Estonia"},{c:"FI",n:"Finland"},{c:"LT",n:"Lithuania"},{c:"LV",n:"Latvia"},{c:"NO1",n:"NO1 Ost"},{c:"NO2",n:"NO2 Sor"},{c:"NO3",n:"NO3 Mid"},{c:"NO4",n:"NO4 Nord"},{c:"NO5",n:"NO5 Vest"},{c:"SE1",n:"SE1 Lulea"},{c:"SE2",n:"SE2 Sundsvall"},{c:"SE3",n:"SE3 Stockholm"},{c:"SE4",n:"SE4 Malmo"}];var cfg={region:"' + region + '",range:' + range + '};var sel=document.getElementById("region");regions.forEach(function(r){var o=document.createElement("option");o.value=r.c;o.textContent=r.n;if(r.c===cfg.region)o.selected=true;sel.appendChild(o)});var ri=document.getElementById("range");var rv=document.getElementById("rangeValue");ri.value=cfg.range;rv.textContent=cfg.range+" h";ri.addEventListener("input",function(){rv.textContent=ri.value+" h"});function save(){var s={region:sel.value,range:parseInt(ri.value,10)};location.href="pebblejs://close#"+encodeURIComponent(JSON.stringify(s))}function cancel(){location.href="pebblejs://close#"}<\/script></body></html>';
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function openSettings(region, range) {
  var savedRegion = region || localStorage.getItem("region") || "FI";
  var savedRange = range != null ? range : parseInt(localStorage.getItem("range") || "3", 10);
  if (isNaN(savedRange)) savedRange = 3;
  var url = getConfigUrl(savedRegion, savedRange);
  Pebble.openURL(url);
}

Pebble.addEventListener("ready", moddableProxy.readyReceived);

Pebble.addEventListener("showConfiguration", function () {
  openSettings();
});

Pebble.addEventListener("webviewclosed", function (e) {
  if (!e.response) {
    console.log("Config cancelled");
    return;
  }
  try {
    var settings = JSON.parse(decodeURIComponent(e.response));
    console.log("Config returned: " + JSON.stringify(settings));
    if (settings.region && settings.range != null) {
      localStorage.setItem("region", settings.region);
      localStorage.setItem("range", String(settings.range));
      sendSettings(settings.region, settings.range);
    }
  } catch (err) {
    console.log("Failed to parse config response: " + err);
  }
});

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
