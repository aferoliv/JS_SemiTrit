document.getElementById("connectButton").addEventListener("click", async () => {


  // Pergunta ao Usuário qual porta deseja abrir/conectar
  const port = await navigator.serial.requestPort();

  // Abre a Porta Selecionada com o Baud Rate de 9600bps
  await port.open({ baudRate: 9600 });
 
  // Lê os dados da Porta Serial
  const reader = port.readable.getReader();
  var data_array = [];
  var tempo=[];
  var temp=0
  //===========================================
  var myChart = new Chart(document.getElementById("DDE"), {
    type: "scatter",
    data: {         
      labels: [1], 
      datasets:[
        {
          label:"Signal",
          showLine: true,
          data:[1],
          lineTension: 0,
          fill: false,
          backgroundColor: "rgba(255, 99, 132, 1)",
          pointBackgroundColor: "rgba(255, 99, 132, 1)",
          pointBorderColor: "rgba(255, 99, 132, 1)",
          pointRadius: 2,
          pointHoverRadius: 0,
          borderWidth: 0,
        }, 
      ]         
      },
    options: {
      tooltips: { mode: "index", intersect: false },
      scales: {
        xAxes: [
          {
            display: true,
            align: "end",
            type: "category",
            scaleLabel: { display: true, labelString: "pH" },
            ticks: {
              maxTicksLimit: 15,
              maxRotation: 0,
              minRotation: 0,
              padding: -5,
            },
          },
        ],
      },
    },
  
  })

  //===========================================
  //
  try {
    while (true) {
      const { value, done } = await reader.read();
      // Interrompe a coleta de dados
      
      if (done) {
        // done = true significa que todo conteudo da porta serial foi lido
        break;
      }
      // Converte of format Uint8Array para string para adicionar ao elemento HTML.
      const textDecoder = new TextDecoder();
      const text = textDecoder.decode(value);
      data_array = text.split("b'");
      //cria um contador para o eixo x
      temp++;
      tempo.push(temp)
      //
      document.getElementById("dataLog").value += data_array;
      // modifica apenas a matriz de dados dos eixos x e y

      myChart.data.datasets.labels=tempo;
      myChart.data.datasets.data = data_array.map(d => d[1]); // 
      
      // clica no botão Fecha a Porta
      document.getElementById("unconnectButton").addEventListener("click", async () => {
          console.log("clicou no botão fecha porta");
          fechaSerial();
      })
      
      };//fecha o while
    console.log("fora do while", data_array);
  } catch (error) {
    console.error(error);
   
  } finally {
    reader.releaseLock();
  }
}); //fecha o try 



function fechaSerial() {  }// fecha a porta Serial e salva os dados


   /* const textEncoder = new TextEncoderStream();
    const writer = textEncoder.writable.getWriter();
    const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);

    reader.cancel();
    await readableStreamClosed.catch(() => { /* Ignore the error / });

    writer.close();
    await writableStreamClosed;

    await port.close();
    */

//-------------------------------//
