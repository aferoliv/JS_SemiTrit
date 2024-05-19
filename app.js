document.addEventListener("DOMContentLoaded", () => {
  // DOM elements for interaction
  const elements = {
    instrumentSelect: document.getElementById('instrument'), // Instrument dropdown
    toggleButton: document.getElementById('toggle-button'), // Connect/Disconnect button
    readIntervalSelect: document.getElementById('read-interval'), // Read interval dropdown
    realTimeChartCtx: document.getElementById('real-time-chart').getContext('2d'), // Real-time chart context
    experimentChartCtx: document.getElementById('experiment-chart').getContext('2d'), // Experiment chart context
    derivativeChartCtx: document.getElementById('derivative-chart').getContext('2d'), // Derivative chart context
    realTimeTableBody: document.getElementById('real-time-table-body'), // Real-time table body
    experimentTableBody: document.getElementById('experiment-table-body'), // Experiment table body
    addExperimentDataButton: document.getElementById('add-experiment-data-button'), // Add data to experiment button
    downloadRealTimeDataButton: document.getElementById('download-real-time-data-button'), // Download real-time data button
    downloadExperimentDataButton: document.getElementById('download-experiment-data-button'), // Download experiment data button
    downloadDerivativeDataButton: document.getElementById('download-derivative-data-button'), // Download derivative data button
    maxPointsInput: document.getElementById('max-points'), // Max points input for real-time chart
    volumeInput: document.getElementById('volume'), // Volume input for experiment data
    realTimeTable: document.querySelector('#real-time-table-body').parentElement.parentElement, // Real-time table element
    experimentTable: document.querySelector('#experiment-table-body').parentElement.parentElement // Experiment table element
  };

  // Variables for managing state
  let port, reader, readTimer, updateTimer; // Serial port and timers
  let buffer = ""; // Buffer for incoming serial data
  let lastValidData = null; // Last valid data point
  let realTimeData = [], experimentData = [], derivativeData = []; // Data arrays
  let volumeSum = 0, readCount = 0, experimentReadCount = 0; // Counters
  let isConnected = false; // Connection state

  // Initialize Charts
const charts = {
  realTimeChart: new Chart(elements.realTimeChartCtx, createChartConfig('Real-Time Chart', 'Read Number', 'pH Value')),
  experimentChart: new Chart(elements.experimentChartCtx, createChartConfig('Experiment Chart', 'Volume', 'pH Value')),
  derivativeChart: new Chart(elements.derivativeChartCtx, createChartConfig('Derivative Chart', 'Average Volume', 'Derivative', false))
};

  // Initialize Instument Options
  const instrumentList = [
    { name: "Lucadema - LUCA210 - Escala pH", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
    { name: "pH Meter 2", baudRate: 19200, dataBits: 8, stopBits: 1, parity: "none" }
  ];
  populateInstrumentOptions(instrumentList, elements.instrumentSelect);

  // Event Listeners
  elements.toggleButton.addEventListener('click', toggleConnection);
  elements.addExperimentDataButton.addEventListener('click', addExperimentData);
  elements.downloadRealTimeDataButton.addEventListener('click', () => downloadCSV(realTimeData, 'real-time_data.csv', ['time', 'read', 'pH', 'temperature']));
  elements.downloadExperimentDataButton.addEventListener('click', () => downloadCSV(experimentData, 'experiment_data.csv', ['time', 'read', 'volume', 'pH', 'temperature']));
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

  // Toggle connection state
  async function toggleConnection() {
    if (isConnected) {
      await disconnect();
    } else {
      await connect();
    }
  }

  // Connect to the selected instrument
  async function connect() {
    const instrument = JSON.parse(elements.instrumentSelect.value); // Get selected instrument details
    const serialOptions = {
      baudRate: instrument.baudRate,
      dataBits: instrument.dataBits,
      stopBits: instrument.stopBits,
      parity: instrument.parity
    };

    try {
      port = await navigator.serial.requestPort(); // Request a port and open a connection
      await port.open(serialOptions);
      reader = port.readable.getReader();
      startSerialReading();
      updateReadInterval();
      toggleButtonState(true);
      isConnected = true;
    } catch (err) {
      console.error("Failed to connect:", err);
      alert("Failed to connect to the instrument. Please check the connection and try again.");
    }
  }

  // Disconnect from the instrument
  async function disconnect() {
    if (reader) reader.releaseLock(); // Release the lock on the reader
    if (port) await port.close(); // Close the port
    clearInterval(readTimer); // Clear the read timer
    clearInterval(updateTimer); // Clear the update timer
    toggleButtonState(false); // Update button state
    isConnected = false; // Update connection state
  }

  // Start reading data from the serial port
  function startSerialReading() {
    readTimer = setInterval(readSerialData, 500); // Set an interval to read data every 500ms
  }

  // Read data from the serial port
  async function readSerialData() {
    try {
      const { value, done } = await reader.read(); // Read data from the port
      if (done) return; // Exit if reader is done
      buffer += new TextDecoder().decode(value); // Append new data to the buffer
      console.log("Raw data received:", buffer);

      let index;
      while ((index = buffer.indexOf('\r')) >= 0) { // Process each line of data
        const dataStr = buffer.slice(0, index + 1).trim(); // Extract a single line of data
        buffer = buffer.slice(index + 1); // Remove processed data from buffer
        const parsedData = parseData(dataStr); // Parse the data
        if (parsedData) lastValidData = parsedData; // Update last valid data
      }
    } catch (err) {
      console.error("Failed to read data:", err);
    }
  }

  // Update the read interval
  function updateReadInterval() {
    clearInterval(updateTimer); // Clear any existing update timer
    const readInterval = parseInt(elements.readIntervalSelect.value); // Get selected interval
    updateTimer = setInterval(updateRealTimeData, readInterval); // Set a new interval
    updateRealTimeData(); // Update real-time data immediately
  }

  // Update the real-time chart based on max points
  function updateRealTimeChart() {
    const maxPoints = parseInt(elements.maxPointsInput.value); // Get max points value
    const recentData = realTimeData.slice(-maxPoints); // Get the most recent data points
    charts.realTimeChart.data.datasets[0].data = recentData.map(data => ({ x: data.read, y: data.pH })); // Update chart data
    charts.realTimeChart.update(); // Refresh the chart
  }

  // Update the charts and tables with the latest data
  function updateRealTimeData() {
    if (!lastValidData) return; // Exit if no valid data available

    const data = { ...lastValidData, ...getCurrentDateTime(), read: ++readCount }; // Create a new data point
    realTimeData.push(data); // Add to real-time data array
    updateTable(elements.realTimeTableBody, realTimeData, ['time', 'read', 'pH', 'temperature']); // Update real-time table
    updateRealTimeChart(); // Update real-time chart

    toggleDownloadButton(elements.downloadRealTimeDataButton, realTimeData); // Enable download button if data exists
  }

  // Add experiment data to the chart and table
  function addExperimentData() {
    if (!lastValidData) return; // Exit if no valid data available
    const volume = parseInt(elements.volumeInput.value); // Get input volume
    const currentDateTime = getCurrentDateTime(); // Get current date and time

    // If experimentData is empty
    let data;
    if (experimentData.length === 0) {
      data = { ...lastValidData, ...currentDateTime, read: ++experimentReadCount, volume: 0 }; // Create new data point with volume 0
      elements.addExperimentDataButton.textContent = "Add"; // Change button text to "Add"      
    } else {
      data = { ...lastValidData, ...currentDateTime, read: ++experimentReadCount, volume: volumeSum += volume }; // Create new data point    
    }
    experimentData.push(data); // Add to experiment data array

    updateTable(elements.experimentTableBody, experimentData, ['time', 'read', 'volume', 'pH', 'temperature']); // Update experiment table
    updateChart(charts.experimentChart, experimentData, 'volume', 'pH'); // Update experiment chart
    updateDerivativeData(); // Update derivative data
    playBipSound(); // Play a sound
    addVisualFeedback(elements.addExperimentDataButton); // Provide visual feedback
    toggleDownloadButton(elements.downloadExperimentDataButton, experimentData); // Enable download button if data exists
  }

  // Parse the data string from the instrument
  function parseData(dataStr) {
    const parts = dataStr.split(','); // Split data string into parts
    if (parts.length !== 2) return null; // Ensure data is valid

    const pH = parseFloat(parts[0]); // Parse pH value
    const temperature = parseFloat(parts[1]).toFixed(1); // Parse and format temperature
    if (isNaN(pH) || pH < 1 || pH > 14 || isNaN(temperature)) return null; // Validate data

    return { pH, temperature }; // Return parsed data
  }

  // Update Derivative Data and Chart
  function updateDerivativeData() {
    if (experimentData.length < 2) return; // Ensure sufficient data exists

    derivativeData = [];

    for (let i = 1; i < experimentData.length; i++) { // Calculate derivatives
      const volume1 = experimentData[i - 1].volume;
      const volume2 = experimentData[i].volume;
      const pH1 = experimentData[i - 1].pH;
      const pH2 = experimentData[i].pH;

      const averageVolume = (volume1 + volume2) / 2;
      const derivativeValue = ((pH2 - pH1) / (volume2 - volume1) * 1000);

      derivativeData.push({
        averageVolume: averageVolume.toFixed(1), // Format to 1 decimal place
        derivativeValue: derivativeValue.toFixed(2) // Format to 3 decimal places
      });
    }

    updateChart(charts.derivativeChart, derivativeData, 'averageVolume', 'derivativeValue'); // Update derivative chart
    toggleDownloadButton(elements.downloadDerivativeDataButton, derivativeData); // Enable download button if data exists
  }

  // Update table with the latest data
  function updateTable(tableBody, data, fields) {
    tableBody.innerHTML = data.map(row => createTableRow(row, fields)).join(''); // Create and insert table rows
    scrollToBottom(tableBody.parentElement.parentElement); // Scroll to the bottom of the table
  }

  // Update chart with the latest data
  function updateChart(chart, data, xField, yField) {
    chart.data.datasets[0].data = data.map(row => ({ x: row[xField], y: row[yField] })); // Update chart data
    chart.update(); // Refresh the chart
  }

  // Toggle download button state
  function toggleDownloadButton(button, data) {
    button.disabled = data.length === 0; // Enable or disable button based on data length
  }

  // Populate instrument options
  function populateInstrumentOptions(instrumentList, selectElement) {
    instrumentList.forEach(instrument => {
      const option = document.createElement('option'); // Create option element
      option.value = JSON.stringify(instrument); // Set option value
      option.text = instrument.name; // Set option text
      selectElement.add(option); // Add option to select element
    });
  }

  // Create chart configuration
function createChartConfig(label, xAxisLabel, yAxisLabel, maintainAspectRatio = true) {
  return {
    type: 'scatter',
    data: { datasets: [{ label, data: [], backgroundColor: 'rgba(13, 202, 240, 1)', borderColor: 'rgba(13, 202, 240, 1)', showLine: true, borderWidth: 1, pointRadius: 2 }] },
    options: {
      maintainAspectRatio: maintainAspectRatio,
      plugins: {
        legend: {
          display: false // Hide legend
        }
      },
      scales: {
        x: { type: 'linear', position: 'bottom', title: { display: true, text: xAxisLabel } }, // X-axis configuration
        y: { title: { display: true, text: yAxisLabel } } // Y-axis configuration
      }
    }
  };
}

  // Create table row from data
  function createTableRow(data, fields) {
    return `<tr>${fields.map(field => `<td>${data[field]}</td>`).join('')}</tr>`; // Generate HTML for a table row
  }

  // Get current date and time
  function getCurrentDateTime() {
    const now = new Date();
    return { date: now.toLocaleDateString(), time: now.toLocaleTimeString() }; // Return formatted date and time
  }

  // Scroll to the bottom of a specific scrollable element
  function scrollToBottom(scrollableElement) {
    scrollableElement.scrollTop = scrollableElement.scrollHeight; // Scroll to bottom
  }

  // Toggle connection button state
  function toggleButtonState(isConnected) {
    elements.toggleButton.textContent = isConnected ? 'Disconnect' : 'Connect'; // Update button text
    elements.toggleButton.classList.toggle('btn-warning', isConnected); // Toggle button class
    elements.toggleButton.classList.toggle('btn-success', !isConnected); // Toggle button class
  }

  // Download data as CSV
  function downloadCSV(dataArray, filename, headers) {
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...dataArray.map(e => headers.map(header => e[header]).join(','))].join('\n'); // Generate CSV content
    const encodedUri = encodeURI(csvContent); // Encode URI
    const link = document.createElement("a"); // Create download link
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click(); // Trigger download
    document.body.removeChild(link); // Remove link
  }

  // Play a "bip" sound
  function playBipSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)(); // Create audio context
    const oscillator = audioContext.createOscillator(); // Create oscillator
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // Set frequency
    oscillator.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1); // Stop after 0.1 seconds
  }

  // Add visual feedback to the button
  function addVisualFeedback(button) {
    button.classList.add('btn-dark'); // Add class for visual feedback
    button.classList.remove('btn-primary'); // Remove original class
    setTimeout(() => {
      button.classList.remove('btn-dark'); // Remove feedback class
      button.classList.add('btn-primary'); // Add original class back
    }, 500); // Duration of feedback
  }
});
