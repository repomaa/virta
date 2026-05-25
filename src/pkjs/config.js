module.exports = [
  {
    type: "heading",
    defaultValue: "Virta Settings"
  },
  {
    type: "text",
    defaultValue: "Configure your electricity price region and cheapest window."
  },
  {
    type: "section",
    items: [
      {
        type: "heading",
        defaultValue: "Region"
      },
      {
        type: "select",
        messageKey: "REGION",
        defaultValue: "FI",
        label: "Price Region",
        options: [
          { label: "DK1 West", value: "DK1" },
          { label: "DK2 East", value: "DK2" },
          { label: "Estonia", value: "EE" },
          { label: "Finland", value: "FI" },
          { label: "Lithuania", value: "LT" },
          { label: "Latvia", value: "LV" },
          { label: "NO1 Ost", value: "NO1" },
          { label: "NO2 Sor", value: "NO2" },
          { label: "NO3 Mid", value: "NO3" },
          { label: "NO4 Nord", value: "NO4" },
          { label: "NO5 Vest", value: "NO5" },
          { label: "SE1 Lulea", value: "SE1" },
          { label: "SE2 Sundsvall", value: "SE2" },
          { label: "SE3 Stockholm", value: "SE3" },
          { label: "SE4 Malmo", value: "SE4" }
        ]
      }
    ]
  },
  {
    type: "section",
    items: [
      {
        type: "heading",
        defaultValue: "Window"
      },
      {
        type: "slider",
        messageKey: "RANGE",
        defaultValue: 3,
        label: "Cheapest Window (hours)",
        min: 1,
        max: 24,
        step: 1
      }
    ]
  },
  {
    type: "submit",
    defaultValue: "Save Settings"
  }
];
