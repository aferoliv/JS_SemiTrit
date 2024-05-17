document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const elements = {
    equipmentSelect: document.getElementById('equipment'),
    toggleButton: document.getElementById('toggle-button'),
    readIntervalSelect: document.getElementById('read-interval'),
    realTimeChartCtx: document.getElementById('real-time-chart').getContext('2d'),
    experimentChartCtx: document.getElementById('experiment-chart').getContext('2d'),
    realTimeTableBody: document.getElementById('real-time-table-body'),
    experimentTableBody: document.getElementById('experiment-table-body'),
    addExperimentButton: document.getElementById('add-experiment-button'),
    downloadRealTimeDataButton: document.getElementById('download-real-time-data-button'),
    downloadExperimentDataButton: document.getElementById('download-experiment-data-button'),
    maxPointsInput: document.getElementById('max-points'),
    volumeInput: document.getElementById('volume'),
    realTimeTable: document.querySelector('#real-time-table-body').parentElement.parentElement,
    experimentTable: document.querySelector('#experiment-table-body').parentElement.parentElement
  };

  let port, reader, buffer = '', readTimer, updateTimer;
  let lastValidData = null;
  let realTimeData = [], experimentData = [];
  let volumeSum = 0, readCount = 0, experimentReadCount = 0;
  let isConnected = false;

  // Initialize Charts
  const charts = {
    realTimeChart: new Chart(elements.realTimeChartCtx, createChartConfig('', 'Read Number', 'pH Value')),
    experimentChart: new Chart(elements.experimentChartCtx, createChartConfig('', 'Volume', 'pH Value'))
  };

  // Initialize Equipment Options
  const equipmentList = [
    { name: "Lucadema - LUCA210 - Escala pH", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
    { name: "pH Meter 2", baudRate: 19200, dataBits: 8, stopBits: 1, parity: "none" }
  ];
  populateEquipmentOptions(equipmentList, elements.equipmentSelect);

  // Event Listeners
  elements.toggleButton.addEventListener('click', toggleConnection);
  elements.addExperimentButton.addEventListener('click', addExperimentData);
  elements.downloadRealTimeDataButton.addEventListener('click', () => downloadCSV(realTimeData, 'real-time_data.csv', ['date', 'time', 'read', 'pH', 'temperature']));
  elements.downloadExperimentDataButton.addEventListener('click', () => downloadCSV(experimentData, 'experiment_data.csv', ['date', 'time', 'read', 'volume', 'pH', 'temperature']));
  elements.readIntervalSelect.addEventListener('change', updateReadInterval);
  elements.maxPointsInput.addEventListener('change', updateRealTimeChart);

  // Toggle connection
  async function toggleConnection() {
    if (isConnected) {
      await disconnect();
    } else {
      await connect();
    }
  }

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
      toggleButtonState(true);
      isConnected = true;
    } catch (err) {
      console.error("Failed to connect:", err);
      alert("Failed to connect to the equipment. Please check the connection and try again.");
    }
  }

  // Disconnect from the equipment
  async function disconnect() {
    if (reader) reader.releaseLock();
    if (port) await port.close();
    clearInterval(readTimer);
    clearInterval(updateTimer);
    toggleButtonState(false);
    isConnected = false;
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
    if (!lastValidData) return;
    const volume = parseInt(elements.volumeInput.value);
    const currentDateTime = getCurrentDateTime();
    const data = { ...lastValidData, ...currentDateTime, read: ++experimentReadCount, volume: volumeSum += volume };
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
    const temperature = parseFloat(parts[1]).toFixed(1); // Format temperature to 1 decimal place
    if (isNaN(pH) || pH < 1 || pH > 14 || isNaN(temperature)) return null;

    return { pH, temperature };
  }

  // Update the real-time table with the latest data
  function updateRealTimeTable() {
    elements.realTimeTableBody.innerHTML = realTimeData.map(data => createTableRow(data, ['date', 'time', 'read', 'pH', 'temperature'])).join('');
    scrollToBottom(elements.realTimeTable);
  }

  // Update the experiment table with the latest data
  function updateExperimentTable() {
    elements.experimentTableBody.innerHTML = experimentData.map(data => createTableRow(data, ['date', 'time', 'read', 'volume', 'pH', 'temperature'])).join('');
    scrollToBottom(elements.experimentTable);
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
      data: { datasets: [{ label, data: [], backgroundColor: 'rgba(13, 202, 240, 1)', borderColor: 'rgba(13, 202, 240, 1)', showLine: true, borderWidth: 1, pointRadius: 3 }] },
      options: {
        plugins: {
          legend: {
            display: false
          }
        },
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

  // Scroll to the bottom of a specific scrollable element
  function scrollToBottom(scrollableElement) {
    scrollableElement.scrollTop = scrollableElement.scrollHeight;    
  }

  // Toggle connection button state
  function toggleButtonState(isConnected) {
    elements.toggleButton.textContent = isConnected ? 'Disconnect' : 'Connect';
    elements.toggleButton.classList.toggle('btn-warning', isConnected);
    elements.toggleButton.classList.toggle('btn-info', !isConnected);
  }

  // Download data as CSV
  function downloadCSV(dataArray, filename, headers) {
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...dataArray.map(e => headers.map(header => e[header]).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
});
