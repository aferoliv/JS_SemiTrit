document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const equipmentSelect = document.getElementById('equipment');
  const connectButton = document.getElementById('connect-button');
  const disconnectButton = document.getElementById('disconnect-button');
  const readIntervalSelect = document.getElementById('read-interval');
  const realTimeChartCtx = document.getElementById('real-time-chart').getContext('2d');
  const experimentChartCtx = document.getElementById('experiment-chart').getContext('2d');
  const realTimeTableBody = document.getElementById('real-time-table-body');
  const experimentTableBody = document.getElementById('experiment-table-body');
  const addExperimentButton = document.getElementById('add-experiment-button');
  const downloadRealTimeDataButton = document.getElementById('download-real-time-data-button');
  const downloadExperimentDataButton = document.getElementById('download-experiment-data-button');
  const maxPointsInput = document.getElementById('max-points');
  const volumeInput = document.getElementById('volume');

  let port;
  let reader;
  let buffer;
  let readTimer;
  let updateTimer;
  let lastValidData = null; // Store the last valid data read
  let lastUpdatedData = null; // Store the last data used to update the chart
  let realTimeChartData = [];
  let realTimeTableData = [];
  let experimentData = [];
  let volumeSum = 0;
  let readCount = 0; // Initialize read count for sequential number

  // Initialize charts
  const realTimeChart = new Chart(realTimeChartCtx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Real-time Data',
        data: [],
        backgroundColor: 'rgba(75, 192, 192, 1)',
        borderColor: 'rgba(75, 192, 192, 1)',
        showLine: true
      }]
    },
    options: {
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          title: {
            display: true,
            text: 'Data Point Number'
          }
        },
        y: {
          title: {
            display: true,
            text: 'pH Value'
          }
        }
      }
    }
  });

  const experimentChart = new Chart(experimentChartCtx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Experiment Data',
        data: [],
        backgroundColor: 'rgba(153, 102, 255, 1)',
        borderColor: 'rgba(153, 102, 255, 1)',
        showLine: true
      }]
    },
    options: {
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          title: {
            display: true,
            text: 'Volume'
          }
        },
        y: {
          title: {
            display: true,
            text: 'pH Value'
          }
        }
      }
    }
  });

  // Initialize equipment options
  async function initializeOptions() {
    // Example equipment list
    const equipments = [
      { name: "Lucadema - LUCA210 - Escala pH", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
      { name: "pH Meter 2", baudRate: 19200, dataBits: 8, stopBits: 1, parity: "none" }
    ];
    equipments.forEach(equipment => {
      const option = document.createElement('option');
      option.value = JSON.stringify(equipment);
      option.text = equipment.name;
      equipmentSelect.add(option);
    });
  }

  // Connect to selected equipment
  async function connect() {
    const equipment = JSON.parse(equipmentSelect.value);
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
      updateReadInterval(); // Ensure chart updates start immediately
      connectButton.disabled = true;
      disconnectButton.disabled = false;
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  }

  // Disconnect from equipment
  async function disconnect() {
    if (reader) {
      reader.releaseLock();
      reader = null;
    }
    if (port) {
      await port.close();
      port = null;
    }
    clearInterval(readTimer);
    clearInterval(updateTimer);
    connectButton.disabled = false;
    disconnectButton.disabled = true;
  }

  // Start reading serial data at a constant rate
  function startSerialReading() {
    readTimer = setInterval(readSerialData, 500); // Read data every second
    readIntervalSelect.addEventListener('change', updateReadInterval);
    maxPointsInput.addEventListener('change', updateRealTimeChartPoints);
  }

  // Read data from equipment
  async function readSerialData() {
    try {
      const { value, done } = await reader.read();
      if (done) {
        console.log("Stream closed");
        return;
      }
      buffer += new TextDecoder().decode(value);
      console.log("Raw data received:", buffer);

      let index;
      while ((index = buffer.indexOf('\r')) >= 0) {
        const dataStr = buffer.slice(0, index + 1).trim();
        buffer = buffer.slice(index + 1);
        const data = parseData(dataStr);
        if (data) {
          lastValidData = data; // Store the last valid data
          //console.log("Valid data stored:", data);
        } else {
          //console.warn("Invalid data format detected. Ignoring...");
        }
      }
    } catch (err) {
      //console.error("Failed to read data:", err);
    }
  }

  // Update reading interval
  function updateReadInterval() {
    clearInterval(updateTimer);
    const readInterval = parseInt(readIntervalSelect.value);
    updateTimer = setInterval(updateChartsAndTables, readInterval);
    updateChartsAndTables(); // Update immediately when interval changes
  }

  // Update real-time chart points based on maxPointsInput
  function updateRealTimeChartPoints() {
    const maxPoints = parseInt(maxPointsInput.value);
    const recentData = realTimeTableData.slice(-maxPoints);
    realTimeChartData = recentData.map((data) => ({ x: data.read, y: data.pH }));
    updateRealTimeChart();
  }

  // Update charts and tables with the last valid data
  function updateChartsAndTables() {
    if (!lastValidData || lastValidData === lastUpdatedData) return; // Skip if no valid data or data hasn't changed

    const data = lastValidData;
    lastUpdatedData = data; // Update the last updated data
    //console.log("Updating with data:", data);

    // Get current date and time from the computer
    const now = new Date();
    data.date = now.toLocaleDateString();
    data.time = now.toLocaleTimeString();

    // Update real-time table
    readCount += 1;
    data.read = readCount;
    realTimeTableData.push(data);
    updateRealTimeTable();

    // Update real-time chart
    const maxPoints = parseInt(maxPointsInput.value);
    const recentData = realTimeTableData.slice(-maxPoints);
    realTimeChartData = recentData.map((data) => ({ x: data.read, y: data.pH }));
    updateRealTimeChart();

    // Add to experiment chart if button clicked
    addExperimentButton.addEventListener('click', () => {
      volumeSum += parseInt(volumeInput.value);
      data.volume = volumeSum;
      experimentData.push(data);
      updateExperimentChart();
      updateExperimentTable();
    });
  }

  // Parse incoming data string
  // Parse incoming data string
  function parseData(dataStr) {
    // Assuming dataStr format: "6.154 , 25.0"
    const parts = dataStr.split(',');
    if (parts.length !== 2) {
      //console.warn("Invalid data format:", dataStr);
      return null;
    }

    const pH = parseFloat(parts[0]);
    const temperature = parseFloat(parts[1]);

    if (isNaN(pH) || pH < 1 || pH > 14) {
      return null;
    }

    if (isNaN(temperature)) {
      return null;
    }

    return {
      pH,
      temperature
    };
  }

  // Update real-time chart
  function updateRealTimeChart() {
    realTimeChart.data.datasets[0].data = realTimeChartData;
    realTimeChart.update();
  }

  // Update experiment chart
  function updateExperimentChart() {
    experimentChart.data.datasets[0].data = experimentData.map(data => ({ x: data.volume, y: data.pH }));
    experimentChart.update();
  }

  // Update real-time table
  function updateRealTimeTable() {
    realTimeTableBody.innerHTML = '';
    realTimeTableData.forEach(data => {
      const row = `<tr>
        <td>${data.date}</td>
        <td>${data.time}</td>
        <td>${data.read}</td>
        <td>${data.pH}</td>
        <td>${data.temperature}</td>
      </tr>`;
      realTimeTableBody.innerHTML += row;
    });
    // Auto-scroll to the bottom of the table
    const scrollableTable = document.querySelector('.scrollable-table');
    scrollableTable.scrollTop = scrollableTable.scrollHeight;
  }

  // Update experiment table
  function updateExperimentTable() {
    experimentTableBody.innerHTML = '';
    experimentData.forEach(data => {
      const row = `<tr>
        <td>${data.date}</td>
        <td>${data.time}</td>
        <td>${data.volume}</td>
        <td>${data.pH}</td>
        <td>${data.temperature}</td>
      </tr>`;
      experimentTableBody.innerHTML += row;
    });
  }

  // Download real-time data as CSV
  downloadRealTimeDataButton.addEventListener('click', () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + realTimeTableData.map(e => `${e.date},${e.time},${e.read},${e.pH},${e.temperature}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "real-time_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Download experiment data as CSV
  downloadExperimentDataButton.addEventListener('click', () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + experimentData.map(e => `${e.date},${e.time},${e.volume},${e.pH},${e.temperature}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "experiment_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Event listeners
  connectButton.addEventListener('click', connect);
  disconnectButton.addEventListener('click', disconnect);

  // Initialize options on load
  initializeOptions();
});
