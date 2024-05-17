document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const elements = {
    equipmentSelect: document.getElementById('equipment'),
    connectButton: document.getElementById('connect-button'),
    disconnectButton: document.getElementById('disconnect-button'),
    readIntervalSelect: document.getElementById('read-interval'),
    realTimeChartCtx: document.getElementById('real-time-chart').getContext('2d'),
    experimentChartCtx: document.getElementById('experiment-chart').getContext('2d'),
    realTimeTableBody: document.getElementById('real-time-table-body'),
    experimentTableBody: document.getElementById('experiment-table-body'),
    addExperimentButton: document.getElementById('add-experiment-button'),
    downloadRealTimeDataButton: document.getElementById('download-real-time-data-button'),
    downloadExperimentDataButton: document.getElementById('download-experiment-data-button'),
    maxPointsInput: document.getElementById('max-points'),
    volumeInput: document.getElementById('volume')
  };

  let port, reader, buffer = '', readTimer, updateTimer;
  let lastValidData = null;
  let realTimeData = [], experimentData = [];
  let volumeSum = 0, readCount = 0;

  // Initialize Charts
  const charts = {
    realTimeChart: new Chart(elements.realTimeChartCtx, createChartConfig('Real-time Data', 'Read Number', 'pH Value')),
    experimentChart: new Chart(elements.experimentChartCtx, createChartConfig('Experiment Data', 'Volume', 'pH Value'))
  };

  // Initialize Equipment Options
  const equipmentList = [
    { name: "Lucadema - LUCA210 - Escala pH", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
    { name: "pH Meter 2", baudRate: 19200, dataBits: 8, stopBits: 1, parity: "none" }
  ];
  populateEquipmentOptions(equipmentList, elements.equipmentSelect);

  // Event Listeners
  elements.connectButton.addEventListener('click', connect);
  elements.disconnectButton.addEventListener('click', disconnect);
  elements.addExperimentButton.addEventListener('click', addExperimentData);
  elements.downloadRealTimeDataButton.addEventListener('click', () => downloadCSV(realTimeData, 'real-time_data.csv'));
  elements.downloadExperimentDataButton.addEventListener('click', () => downloadCSV(experimentData, 'experiment_data.csv'));
  elements.readIntervalSelect.addEventListener('change', updateReadInterval);
  elements.maxPointsInput.addEventListener('change', updateRealTimeChart);

  // Connect to the selected equipment
  async function connect() {
    const equipment = JSON.parse(elements.equipmentSelect.value);
    const serialOptions = {
      baudRate: equipment.baudRate,
      dataBits: equipment.dataBits,
      stopBits: equipment.stopBits,
      parity: equipment.parity
    };

    try {
      port = await navigator.serial.requestPort();
      await port.open(serialOptions);
      reader = port.readable.getReader();
      startSerialReading();
      updateReadInterval();
      toggleConnectionButtons(true);
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  }

  // Disconnect from the equipment
  async function disconnect() {
    if (reader) reader.releaseLock();
    if (port) await port.close();
    clearInterval(readTimer);
    clearInterval(updateTimer);
    toggleConnectionButtons(false);
  }

  // Start reading data from the serial port
  function startSerialReading() {
    readTimer = setInterval(readSerialData, 500);
  }

  // Read data from the serial port
  async function readSerialData() {
    try {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += new TextDecoder().decode(value);
      console.log("Raw data received:", buffer);  // Log raw serial data

      let index;
      while ((index = buffer.indexOf('\r')) >= 0) {
        const dataStr = buffer.slice(0, index + 1).trim();
        buffer = buffer.slice(index + 1);
        const data = parseData(dataStr);
        if (data) lastValidData = data;
      }
    } catch (err) {
      console.error("Failed to read data:", err);
    }
  }

  // Update the read interval
  function updateReadInterval() {
    clearInterval(updateTimer);
    const readInterval = parseInt(elements.readIntervalSelect.value);
    updateTimer = setInterval(updateChartsAndTables, readInterval);
    updateChartsAndTables();
  }

  // Update the real-time chart based on max points
  function updateRealTimeChart() {
    const maxPoints = parseInt(elements.maxPointsInput.value);
    const recentData = realTimeData.slice(-maxPoints);
    charts.realTimeChart.data.datasets[0].data = recentData.map(data => ({ x: data.read, y: data.pH }));
    charts.realTimeChart.update();
  }

  // Update the charts and tables with the latest data
  function updateChartsAndTables() {
    if (!lastValidData) return;

    const data = { ...lastValidData, ...getCurrentDateTime(), read: ++readCount };
    realTimeData.push(data);
    updateRealTimeTable();
    updateRealTimeChart();
  }

  // Add experiment data to the chart and table
  function addExperimentData() {
    const volume = parseInt(elements.volumeInput.value);
    const data = { ...lastValidData, ...getCurrentDateTime(), volume: volumeSum += volume };
    experimentData.push(data);
    updateExperimentTable();
    charts.experimentChart.data.datasets[0].data = experimentData.map(data => ({ x: data.volume, y: data.pH }));
    charts.experimentChart.update();
  }

  // Parse the data string from the equipment
  function parseData(dataStr) {
    const parts = dataStr.split(',');
    if (parts.length !== 2) return null;

    const pH = parseFloat(parts[0]);
    const temperature = parseFloat(parts[1]);
    if (isNaN(pH) || pH < 1 || pH > 14 || isNaN(temperature)) return null;

    return { pH, temperature };
  }

  // Update the real-time table with the latest data
  function updateRealTimeTable() {
    elements.realTimeTableBody.innerHTML = realTimeData.map(data => createTableRow(data, ['date', 'time', 'read', 'pH', 'temperature'])).join('');
    scrollToBottom();
  }

  // Update the experiment table with the latest data
  function updateExperimentTable() {
    elements.experimentTableBody.innerHTML = experimentData.map(data => createTableRow(data, ['date', 'time', 'volume', 'pH', 'temperature'])).join('');
  }

  // Populate equipment options
  function populateEquipmentOptions(equipmentList, selectElement) {
    equipmentList.forEach(equipment => {
      const option = document.createElement('option');
      option.value = JSON.stringify(equipment);
      option.text = equipment.name;
      selectElement.add(option);
    });
  }

  // Create chart configuration
  function createChartConfig(label, xAxisLabel, yAxisLabel) {
    return {
      type: 'scatter',
      data: { datasets: [{ label, data: [], backgroundColor: 'rgba(75, 192, 192, 1)', borderColor: 'rgba(75, 192, 192, 1)', showLine: true }] },
      options: {
        scales: {
          x: { type: 'linear', position: 'bottom', title: { display: true, text: xAxisLabel } },
          y: { title: { display: true, text: yAxisLabel } }
        }
      }
    };
  }

  // Create table row from data
  function createTableRow(data, fields) {
    return `<tr>${fields.map(field => `<td>${data[field]}</td>`).join('')}</tr>`;
  }

  // Get current date and time
  function getCurrentDateTime() {
    const now = new Date();
    return { date: now.toLocaleDateString(), time: now.toLocaleTimeString() };
  }

  // Scroll to the bottom of a scrollable element
  function scrollToBottom() {
    const scrollableTable = document.querySelector('.scrollable-table');
    scrollableTable.scrollTop = scrollableTable.scrollHeight;    
  }

  // Toggle connection buttons
  function toggleConnectionButtons(isConnected) {
    elements.connectButton.disabled = isConnected;
    elements.disconnectButton.disabled = !isConnected;
  }

  // Download data as CSV
  function downloadCSV(dataArray, filename) {
    const csvContent = "data:text/csv;charset=utf-8," + dataArray.map(e => Object.values(e).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
});
