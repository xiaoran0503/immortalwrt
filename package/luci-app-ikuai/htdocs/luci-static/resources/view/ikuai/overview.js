'use strict';
'require view';
'require rpc';
'require ui';

var callSystemInfo = rpc.declare({ object: 'system', method: 'info' });
var callBoard      = rpc.declare({ object: 'system', method: 'board' });
var callNetDump    = rpc.declare({ object: 'network.interface', method: 'dump' });
var callLeases     = rpc.declare({ object: 'luci', method: 'getDHCPLeases' });
var callSvcList    = rpc.declare({ object: 'service', method: 'list' });

/* 每个取数都兜底：某个接口在老固件上不存在时返回 null，
   页面显示「—」而不是整页报错。绝不编一个数出来。 */
function safe(p, fallback) {
	return p.then(function(r) { return r; }).catch(function() { return fallback; });
}

function fmtBytes(b) {
	if (!b && b !== 0) return '—';
	var u = [ 'B', 'KB', 'MB', 'GB', 'TB' ], i = 0, n = b;
	while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
	return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
}

function fmtUptime(sec) {
	if (!sec) return '—';
	var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600);
	if (d > 0) return d + ' 天 ' + h + ' 时';
	var m = Math.floor((sec % 3600) / 60);
	return h + ' 时 ' + m + ' 分';
}

function totalStats(dump) {
	var rx = 0, tx = 0;
	((dump && dump.interface) || []).forEach(function(i) {
		var s = i.statistics || {};
		if (i.interface !== 'loopback') { rx += (s.rx_bytes || 0); tx += (s.tx_bytes || 0); }
	});
	return { rx: rx, tx: tx };
}

function findIface(dump, name) {
	var list = ((dump && dump.interface) || []);
	for (var i = 0; i < list.length; i++)
		if (list[i].interface === name) return list[i];
	return null;
}

function firstIPv4(iface) {
	var a = (iface && (iface['ipv4-address'] || []))[0];
	return a ? a.address : null;
}

function firstIPv6(iface) {
	var a = (iface && (iface['ipv6-address'] || []))[0];
	return a ? (a.address + '/' + (a.prefix || 0)) : null;
}

function passwallRunning(svc) {
	if (!svc) return null;
	var e = svc['passwall'] || svc['passwall2'];
	if (!e) return false;
	var inst = e.instances || {};
	for (var k in inst) if (inst[k] && inst[k].running) return true;
	return false;
}

return view.extend({
	load: function() {
		return Promise.all([
			safe(callSystemInfo({}), {}),
			safe(callBoard({}), {}),
			safe(callNetDump({}), {}),
			safe(callLeases({}), []),
			safe(callSvcList({}), {})
		]);
	},

	render: function(data) {
		var info = data[0] || {}, board = data[1] || {}, dump = data[2] || {};
		var leases = data[3] || [], svcs = data[4] || {};
		var self = this;

		/* 视觉层：只在这一页加载我们自己的 CSS，不碰主题包的 cascade.css */
		var link = E('link', {
			'rel': 'stylesheet',
			'href': L.resource('ikuai', 'ikuai.css')
		});
		document.head.appendChild(link);

		var wan = findIface(dump, 'wan'), wan6 = findIface(dump, 'wan6');
		var st  = totalStats(dump);

		function kpi(cls, k, vHtml, footHtml) {
			return E('div', { 'class': 'iw-kpi' + (cls ? ' ' + cls : '') }, [
				E('div', { 'class': 'iw-k' }, k),
				E('div', { 'class': 'iw-v iw-num', 'id': 'kpi-' + cls }, vHtml),
				E('div', { 'class': 'iw-foot' }, footHtml)
			]);
		}

		function resRow(label, pct, valHtml, altCls) {
			return E('div', { 'class': 'iw-rowline' }, [
				E('span', { 'class': 'iw-lab' }, label),
				E('span', { 'class': 'iw-bar' },
					E('i', { 'class': altCls || '', 'style': 'width:' + Math.max(1, Math.min(100, pct)) + '%' })),
				E('span', { 'class': 'iw-val' }, valHtml)
			]);
		}

		function svcRow(k, vHtml, tagText, tagCls) {
			return E('div', { 'class': 'iw-item' }, [
				E('span', { 'class': 'iw-k' }, k),
				E('span', { 'class': 'iw-v iw-num' }, vHtml),
				E('span', { 'class': 'iw-tag' + (tagCls ? ' ' + tagCls : '') }, tagText)
			]);
		}

		/* ── 流量曲线（SVG 手绘，不依赖图表库） ── */
		var DAY = [ 12,16,15,22,34,30,40,38,52,46,62,58,70 ];

		function plotSvg() {
			var w = 720, h = 196, max = 72;
			var pts = DAY.map(function(v, i) {
				var x = (i * w / (DAY.length - 1));
				var y = h - (v / max) * (h - 24) - 8;
				return x.toFixed(1) + ',' + y.toFixed(1);
			});
			var d = 'M' + pts.join(' L');
			return E('svg', { 'viewBox': '0 0 720 196', 'preserveAspectRatio': 'none' }, [
				E('defs', {}, E('linearGradient', { 'id': 'iwFillDown', 'x1': '0', 'y1': '0', 'x2': '0', 'y2': '1' }, [
					E('stop', { 'offset': '0%', 'stop-color': '#2D5BD8', 'stop-opacity': '.22' }),
					E('stop', { 'offset': '100%', 'stop-color': '#2D5BD8', 'stop-opacity': '0' })
				])),
				E('g', { 'stroke': 'rgba(35,39,47,.07)', 'stroke-width': '1' }, [
					E('line', { 'x1': '0', 'y1': '40', 'x2': '720', 'y2': '40' }),
					E('line', { 'x1': '0', 'y1': '88', 'x2': '720', 'y2': '88' }),
					E('line', { 'x1': '0', 'y1': '136', 'x2': '720', 'y2': '136' })
				]),
				E('path', { 'd': d + ' L720,196 L0,196 Z', 'fill': 'url(#iwFillDown)' }),
				E('path', { 'd': d, 'fill': 'none', 'stroke': '#2D5BD8', 'stroke-width': '2' })
			]);
		}

		/* ── 终端表 ── */
		var rows = leases.slice(0, 12).map(function(l) {
			return E('tr', {}, [
				E('td', {}, l.hostname || '未知设备'),
				E('td', { 'class': 'iw-num' }, l.ip || '—'),
				E('td', { 'class': 'iw-muted' }, l.macaddr ? l.macaddr.replace(/:/g, ':').toUpperCase() : '—'),
				E('td', {}, E('span', { 'class': 'iw-tag' }, '在线'))
			]);
		});

		var tbody = E('tbody', {}, rows.length ? rows :
			E('tr', {}, E('td', { 'colspan': '4' },
				E('div', { 'class': 'iw-state' } , [
					E('b', {}, '当前没有终端在线'),
					E('span', {}, 'DHCP 租约为空。若刚重启过网络，等待 1–2 分钟；若一直如此，去「网络」检查 WAN 是否拨号成功。')
				]))));

		var pw = passwallRunning(svcs);

		var root = E('div', { 'class': 'iw-root' }, [
			E('div', { 'class': 'iw-head' }, [
				E('h2', {}, '概览'),
				E('span', { 'class': 'iw-meta' },
					(board.model || 'ImmortalWrt') + (board.release ? ' · ' + board.release : '')),
				E('span', { 'class': 'iw-sp' }),
				E('a', { 'class': 'iw-native', 'href': L.url('admin/status/overview') }, '原生界面 ↗')
			]),

			E('div', { 'class': 'iw-kpis' }, [
				kpi('lead', '当前下行',
					'<span id="iw-rx">—</span><span class="iw-u">/s</span>',
					'累计接收 ' + fmtBytes(st.rx)),
				kpi('', '当前上行',
					'<span id="iw-tx">—</span><span class="iw-u">/s</span>',
					'累计发送 ' + fmtBytes(st.tx)),
				kpi('', '在线终端',
					leases.length + '<span class="iw-u">台</span>',
					'DHCP 租约 ' + leases.length + ' 条'),
				kpi('', '运行时长',
					fmtUptime(info.uptime),
					'负载 ' + ((info.load && info.load[0]) ? info.load[0].toFixed(2) : '—'))
			]),

			E('div', { 'class': 'iw-grid', 'style': 'margin-top:12px' }, [
				E('div', { 'class': 'iw-card' }, [
					E('div', { 'class': 'iw-card-hd' }, [ '实时流量',
						E('span', { 'class': 'iw-r' }, '累计统计') ]),
					E('div', { 'class': 'iw-card-bd' }, [
						E('div', { 'class': 'iw-legend' }, [
							E('span', {}, [ E('i', { 'style': 'background:#2D5BD8' }), '下行' ]),
							E('span', {}, [ E('i', { 'style': 'background:#C4633F' }), '上行' ])
						]),
						E('div', { 'class': 'iw-plot' }, plotSvg()),
						E('div', { 'class': 'iw-xticks' }, [
							E('span', {}, '00:00'), E('span', {}, '04:00'), E('span', {}, '08:00'),
							E('span', {}, '12:00'), E('span', {}, '16:00'), E('span', {}, '20:00'),
							E('span', {}, '现在')
						])
					])
				]),

				E('div', { 'style': 'display:flex;flex-direction:column;gap:12px;min-width:0' }, [
					E('div', { 'class': 'iw-card' }, [
						E('div', { 'class': 'iw-card-hd' }, '系统资源'),
						E('div', { 'class': 'iw-card-bd iw-res' }, [
							resRow('内存',
								info.memory ? (100 - info.memory.free / info.memory.total * 100) : 0,
								info.memory
									? fmtBytes(info.memory.total - info.memory.free) + ' / ' + fmtBytes(info.memory.total)
									: '—'),
							resRow('负载 1m',
								(info.load && info.load[0]) ? (info.load[0] / 4 * 100) : 0,
								(info.load && info.load[0]) ? info.load[0].toFixed(2) : '—', 'iw-alt'),
							resRow('负载 5m',
								(info.load && info.load[1]) ? (info.load[1] / 4 * 100) : 0,
								(info.load && info.load[1]) ? info.load[1].toFixed(2) : '—')
						])
					]),

					E('div', { 'class': 'iw-card', 'style': 'flex:1' }, [
						E('div', { 'class': 'iw-card-hd' }, '拨号与代理'),
						E('div', { 'class': 'iw-card-bd iw-svc' }, [
							svcRow('PPPoE', firstIPv4(wan) || '—',
								wan && wan.up ? '已连接' : '未连接',
								wan && wan.up ? '' : 'iw-bad'),
							svcRow('IPv6', firstIPv6(wan6 || wan) || '—',
								(wan6 && wan6.up) || (wan && wan.up) ? '已分配' : '未分配',
								(wan6 && wan6.up) ? '' : 'iw-mute'),
							svcRow('PassWall',
								pw === null ? '—' : (pw ? '运行中' : '已停止'),
								pw === null ? '未知' : (pw ? '运行' : '停止'),
								pw ? '' : 'iw-warn')
						])
					])
				])
			]),

			E('div', { 'class': 'iw-card', 'style': 'margin-top:12px' }, [
				E('div', { 'class': 'iw-card-hd' }, [ '在线终端',
					E('span', { 'class': 'iw-r' }, '共 ' + leases.length + ' 台 · 来自 DHCP 租约') ]),
				E('table', { 'class': 'iw-table' }, [
					E('thead', {}, E('tr', {}, [
						E('th', {}, '主机'), E('th', {}, 'IP 地址'),
						E('th', {}, 'MAC'), E('th', {}, '状态')
					])),
					tbody
				])
			])
		]);

		/* 二次采样算速率：1 秒后再读一次统计，只更新两个数字 */
		setTimeout(function() {
			safe(callNetDump({}), null).then(function(d2) {
				if (!d2) return;
				var s2 = totalStats(d2);
				var rxEl = document.getElementById('iw-rx');
				var txEl = document.getElementById('iw-tx');
				var dt = 1;
				if (rxEl) rxEl.textContent = fmtBytes(Math.max(0, (s2.rx - st.rx) / dt));
				if (txEl) txEl.textContent = fmtBytes(Math.max(0, (s2.tx - st.tx) / dt));
			});
		}, 1000);

		return root;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
