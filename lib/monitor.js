const si = require('systeminformation');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const axios = require('axios');

module.exports = async () => {
  // SETUP
  const screen = blessed.screen({ smartCSR: true, title: 'Systor' });
  const grid = new contrib.grid({ rows: 12, cols: 12, screen });
  const gbPrefix = 'GB';
  const version = 'v1.0.0';

  // DATA GETTERS
  const ipAddr = await axios.get('https://icanhazip.com');
  const geoRes = await axios.get('http://ip-api.com/json/' + ipAddr.data);
  const { lat, lon } = geoRes.data;
  const initialDataSchema = {
    osInfo: 'hostname, distro, arch, release, build, uefi',
    users: '*',
    graphics: 'controllers',
    baseboard: 'manufacturer, model',
    cpu: 'manufacturer, brand',
    memLayout: '*',
    mem: 'total',
    diskLayout: '*',
    fsSize: '*',
    networkInterfaces: '*',
    networkInterfaceDefault: '*',
  };
  const {
    osInfo: os,
    users: usr,
    graphics: gpu,
    baseboard: board,
    cpu: proc,
    memLayout: memInfo,
    diskLayout: disks,
    fsSize: fs,
    networkInterfaces: net,
    networkInterfaceDefault: ifdef,
  } = await si.get(initialDataSchema);

  // TITLE
  grid.set(0, 0, 1, 12, blessed.box, {
    content: 'SysTor ' + version,
    align: 'center',
  });

  // MAP
  const map = grid.set(1, 0, 4, 4, contrib.map, {
    label: ' Current Location ',
  });
  map.addMarker({ lon, lat, color: 'red', char: 'X' });

  // SYSINFO
  const GPUs = gpu.controllers.map(
    ctrl =>
      `Vendor • ${ctrl.vendor}
    Model  • ${ctrl.model}
    vRAM   • ${ctrl.vram}
  
  `,
  );

  grid.set(1, 4, 4, 4, blessed.box, {
    label: ' System info ',
    content: `
  Motherboard
    Manufacturer • ${board.manufacturer}
    Model        • ${board.model}

  Graphics
    ${GPUs}
    `,
  });

  // OS
  const users = usr.map(
    cUsr => `Name        • ${cUsr.user}
    Last login  • ${cUsr.time}
  `,
  );
  grid.set(1, 8, 4, 4, blessed.box, {
    label: ' OS Info ',
    content: `
    Name     • ${os.hostname}
    OS       • ${os.distro} (${os.arch})
    Version  • ${os.release}
    Build    • ${os.build}
    UEFI     • ${os.uefi}

  Users (${users.length})
    ${users}
  `,
  });

  // PROC
  grid.set(5, 0, 1, 3, blessed.box, {
    label: ' Processor ',
    content: `${proc.manufacturer} ${proc.brand}`,
    align: 'center',
  });

  const cpuLoad = grid.set(6, 0, 2, 3, contrib.gauge, {
    label: ` Processor • Load `,
  });

  const cpuTemp = grid.set(8, 0, 3, 3, contrib.bar, {
    label: ` Processor • Temp `,
    barWidth: 4,
    barSpacing: 6,
    maxHeight: 100,
  });

  // MEM
  const initMem = await si.mem();
  grid.set(5, 3, 1, 2.5, blessed.box, {
    label: ' Memory ',
    content:
      (memInfo[0].type || 'No info') + ` • ${(initMem.total / 1000000000).toFixed(1)}${gbPrefix}`,
    align: 'center',
  });

  const memLoad = grid.set(6, 3, 2, 2.5, contrib.gauge, {
    label: ' Memory • Load ',
  });
  const memSwap = grid.set(8, 3, 2, 2.5, contrib.gauge, {
    label: ' Memory • Swap ',
  });

  // DISKS
  const disksD = grid.set(5, 5.5, 3, 4, contrib.table, {
    keys: true,
    interactive: false,
    label: ' Disks ',
    columnSpacing: 3,
    columnWidth: [6, 12, 20, 15],
  });

  disksD.setData({
    headers: ['type', 'mount point', 'vendor', 'size'],
    data: disks.map(disk => [
      disk.type,
      disk.device,
      disk.vendor,
      (disk.size / 1000000000).toFixed(1) + gbPrefix,
    ]),
  });

  const fsD = grid.set(8, 5.5, 3, 4, contrib.table, {
    keys: true,
    interactive: false,
    label: ' Filesystems ',
    columnSpacing: 3,
    columnWidth: [9, 12, 12, 8, 8],
  });
  fsD.setData({
    headers: ['type', 'filesystem', 'mount point', 'size', 'used'],
    data: fs.map(cfs => [
      cfs.type || '',
      cfs.fs || '',
      cfs.mount || '',
      (cfs.size / 1000000000).toFixed(1) + gbPrefix || '',
      (cfs.used / 1000000000).toFixed(1) + gbPrefix || '',
    ]),
  });

  // NET
  const netGraph = grid.set(5, 9.5, 7, 2.5, contrib.tree, {
    label: ' Interfaces ',
  });
  netGraph.focus();
  let itfs = {};
  net.map(
    itf =>
      (itfs[' ' + itf.ifaceName + (ifdef === itf.iface ? ' (default)' : '')] = {
        extended: true,
        children: {
          state: {
            name: ` State  •  ${itf.operstate}`,
          },
          type: {
            name: ` Type   •  ${itf.type}`,
          },
          ip4: {
            name: ` IPv4   •  ${itf.ip4}`,
          },
          mac: {
            name: ` MAC    •  ${itf.mac}`,
          },
          speed: {
            name: ` Speed  •  ${itf.speed} Mb/s`,
          },
        },
      }),
  );
  netGraph.setData({
    extended: true,
    children: itfs,
  });

  const md = grid.set(11, 0, 1, 9.5, contrib.markdown, {
    align: 'center',
    valign: 'middle',
  });
  md.setMarkdown(
    '`System Monitor` ' + version + ' • Made by __BMK__ • Licensed under MIT license.',
  );

  // --- STI
  const getIntervalData = async () => {
    const intervalSchema = {
      currentLoad: 'currentload',
      cpuTemperature: 'cores',
      mem: 'active, available, total, swapused, swapfree, swaptotal',
    };
    const {
      currentLoad: load,
      cpuTemperature: { cores },
      mem,
    } = await si.get(intervalSchema);
    // PROC
    try {
      cpuLoad.setPercent(Math.round(load.currentload));
      cpuTemp.setData({
        titles: cores.map((c, i) => `c${i + 1}`),
        data: cores,
      });
      screen.render();
    } catch (err) {
      console.error(err);
    }

    // MEM
    try {
      let used = Math.round((mem.active / mem.total) * 100);
      let free = Math.round((mem.available / mem.total) * 100);
      let usedSwap = Math.round(mem.swapused / mem.swaptotal) * 100;
      let freeSwap = Math.round(mem.swapfree / mem.swaptotal) * 100;
      memLoad.setStack([
        { percent: used, stroke: used > 80 ? 'red' : 'blue' },
        { percent: free, stroke: 'green' },
      ]);
      memSwap.setStack([
        { percent: usedSwap, stroke: usedSwap > 80 ? 'red' : 'blue' },
        { percent: freeSwap, stroke: 'green' },
      ]);
    } catch (err) {}
  };
  getIntervalData();
  setInterval(getIntervalData, 1000);

  screen.key(['escape', 'q', 'C-c'], (ch, key) => process.exit(0));

  screen.render();
};
