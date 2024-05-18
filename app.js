document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const elements = {
    equipmentSelect: document.getElementById('equipment'),
    toggleButton: document.getElementById('toggle-button'),
    readIntervalSelect: document.getElementById('read-interval'),
    realTimeChartCtx: document.getElementById('real-time-chart').getContext('2d'),
    experimentChartCtx: document.getElementById('experiment-chart').getContext('2d'),
    derivativeChartCtx: document.getElementById('derivative-chart').getContext('2d'),
    realTimeTableBody: document.getElementById('real-time-table-body'),
    experimentTableBody: document.getElementById('experiment-table-body'),
    addExperimentDataButton: document.getElementById('add-experiment-data-button'),
    downloadRealTimeDataButton: document.getElementById('download-real-time-data-button'),
    downloadExperimentDataButton: document.getElementById('download-experiment-data-button'),
    downloadDerivativeDataButton: document.getElementById('download-derivative-data-button'),
    maxPointsInput: document.getElementById('max-points'),
    volumeInput: document.getElementById('volume'),
    realTimeTable: document.querySelector('#real-time-table-body').parentElement.parentElement,
    experimentTable: document.querySelector('#experiment-table-body').parentElement.parentElement
  };

  let port, reader, readTimer, updateTimer;
  let buffer = "";
  let lastValidData = null;
  let realTimeData = [], experimentData = [], derivativeData = [];
  let volumeSum = 0, readCount = 0, experimentReadCount = 0;
  let isConnected = false;

  // Initialize Charts
  const charts = {
    realTimeChart: new Chart(elements.realTimeChartCtx, createChartConfig('Real-Time Chart', 'Read Number', 'pH Value')),
    experimentChart: new Chart(elements.experimentChartCtx, createChartConfig('Experiment Chart', 'Volume', 'pH Value')),
    derivativeChart: new Chart(elements.derivativeChartCtx, createChartConfig('Derivative Chart', 'Average Volume', 'Derivative'))
  };

  // Initialize Equipment Options
  const equipmentList = [
    { name: "Lucadema - LUCA210 - Escala pH", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
    { name: "pH Meter 2", baudRate: 19200, dataBits: 8, stopBits: 1, parity: "none" }
  ];
  populateEquipmentOptions(equipmentList, elements.equipmentSelect);

  // Event Listeners
  elements.toggleButton.addEventListener('click', toggleConnection);
  elements.addExperimentDataButton.addEventListener('click', addExperimentData);
  elements.downloadRealTimeDataButton.addEventListener('click', () => downloadCSV(realTimeData, 'real-time_data.csv', ['date', 'time', 'read', 'pH', 'temperature']));
  elements.downloadExperimentDataButton.addEventListener('click', () => downloadCSV(experimentData, 'experiment_data.csv', ['date', 'time', 'read', 'volume', 'pH', 'temperature']));
  elements.downloadDerivativeDataButton.addEventListener('click', () => downloadCSV(derivativeData, 'derivative_data.csv', ['averageVolume', 'derivativeValue']));
  elements.readIntervalSelect.addEventListener('change', updateReadInterval);
  elements.maxPointsInput.addEventListener('change', updateRealTimeChart);

  // Bind Ctrl + Space to the function addExperimentData
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.code === 'Space') {
      event.preventDefault();
      addExperimentData();
    }
  });

  // Toggle connection
  async function toggleConnection() {
    isConnected ? await disconnect() : await connect();
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
      console.log("Raw data received:", buffer);

      let index;
      while ((index = buffer.indexOf('\r')) >= 0) {
        const dataStr = buffer.slice(0, index + 1).trim();
        buffer = buffer.slice(index + 1);
        const parsedData = parseData(dataStr);
        if (parsedData) lastValidData = parsedData;
      }
    } catch (err) {
      console.error("Failed to read data:", err);
    }
  }

  // Update the read interval
  function updateReadInterval() {
    clearInterval(updateTimer);
    const readInterval = parseInt(elements.readIntervalSelect.value);
    updateTimer = setInterval(updateRealTimeData, readInterval);
    updateRealTimeData();
  }

  // Update the real-time chart based on max points
  function updateRealTimeChart() {
    const maxPoints = parseInt(elements.maxPointsInput.value);
    const recentData = realTimeData.slice(-maxPoints);
    charts.realTimeChart.data.datasets[0].data = recentData.map(data => ({ x: data.read, y: data.pH }));
    charts.realTimeChart.update();
  }

  // Update the charts and tables with the latest data
  function updateRealTimeData() {
    if (!lastValidData) return;

    const data = { ...lastValidData, ...getCurrentDateTime(), read: ++readCount };
    realTimeData.push(data);
    updateTable(elements.realTimeTableBody, realTimeData, ['date', 'time', 'read', 'pH', 'temperature']);
    updateRealTimeChart();

    toggleDownloadButton(elements.downloadRealTimeDataButton, realTimeData);
  }

  // Add experiment data to the chart and table
  function addExperimentData() {
    if (!lastValidData) return;
    const volume = parseInt(elements.volumeInput.value);
    const currentDateTime = getCurrentDateTime();
    const data = { ...lastValidData, ...currentDateTime, read: ++experimentReadCount, volume: volumeSum += volume };
    experimentData.push(data);
    updateTable(elements.experimentTableBody, experimentData, ['date', 'time', 'read', 'volume', 'pH', 'temperature']);
    updateChart(charts.experimentChart, experimentData, 'volume', 'pH');
    updateDerivativeData();
    playBipSound();
    addVisualFeedback(elements.addExperimentDataButton);
    toggleDownloadButton(elements.downloadExperimentDataButton, experimentData);
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

  // Update Derivative Data and Chart
  function updateDerivativeData() {
    if (experimentData.length < 2) return;

    derivativeData = [];

    for (let i = 1; i < experimentData.length; i++) {
      const volume1 = experimentData[i - 1].volume;
      const volume2 = experimentData[i].volume;
      const pH1 = experimentData[i - 1].pH;
      const pH2 = experimentData[i].pH;

      const averageVolume = (volume1 + volume2) / 2;
      const derivativeValue = (pH2 - pH1) / (volume2 - volume1);

      derivativeData.push({
        averageVolume: averageVolume.toFixed(1), // Format to 1 decimal place
        derivativeValue: derivativeValue.toFixed(3) // Format to 3 decimal places
      });
    }

    updateChart(charts.derivativeChart, derivativeData, 'averageVolume', 'derivativeValue');
    toggleDownloadButton(elements.downloadDerivativeDataButton, derivativeData);
  }

  // Update table with the latest data
  function updateTable(tableBody, data, fields) {
    tableBody.innerHTML = data.map(row => createTableRow(row, fields)).join('');
    scrollToBottom(tableBody.parentElement.parentElement);
  }

  // Update chart with the latest data
  function updateChart(chart, data, xField, yField) {
    chart.data.datasets[0].data = data.map(row => ({ x: row[xField], y: row[yField] }));
    chart.update();
  }

  // Toggle download button state
  function toggleDownloadButton(button, data) {
    button.disabled = data.length === 0;
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
      data: { datasets: [{ label, data: [], backgroundColor: 'rgba(13, 202, 240, 1)', borderColor: 'rgba(13, 202, 240, 1)', showLine: true, borderWidth: 1, pointRadius: 2 }] },
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
    elements.toggleButton.classList.toggle('btn-success', !isConnected);
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

  // Play a "bip" sound
  function playBipSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // 440 Hz
    oscillator.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1); // 0.1 second duration
  }

  // Add visual feedback to the button
  function addVisualFeedback(button) {
    button.classList.add('btn-dark');
    button.classList.remove('btn-primary');
    setTimeout(() => {
      button.classList.remove('btn-dark');
      button.classList.add('btn-primary');
    }, 500); // 500 ms duration
  }
});
