'use strict';
'require view';
'require uci';
'require rpc';
'require ui';

var callUciSet = rpc.declare({
	object: 'uci', method: 'set',
	params: [ 'config', 'section', 'option', 'value' ],
	expect: { result: true }
});

var callUciCommit = rpc.declare({
	object: 'uci', method: 'commit',
	params: [ 'config' ],
	expect: { result: true }
});

var callUciApply = rpc.declare({
	object: 'uci', method: 'apply',
	params: [ 'rollback' ],
	expect: { result: true }
});

function val(id) {
	var el = document.getElementById(id);
	return el ? el.value.trim() : '';
}

function field(id, label, value, placeholder, type) {
	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title', 'for': id }, label),
		E('div', { 'class': 'cbi-value-field' },
			E('input', {
				'id': id,
				'class': 'cbi-input-text',
				'type': type || 'text',
				'value': (value != null) ? value : '',
				'placeholder': placeholder || ''
			}))
	]);
}

function pick(id, label, value, options) {
	var opts = options.map(function(o) {
		return E('option', {
			'value': o[0],
			'selected': (o[0] === value) ? 'selected' : null
		}, o[1]);
	});

	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title', 'for': id }, label),
		E('div', { 'class': 'cbi-value-field' },
			E('select', { 'id': id, 'class': 'cbi-input-select' }, opts))
	]);
}

function toggle(id, label, checked) {
	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title', 'for': id }, label),
		E('div', { 'class': 'cbi-value-field' },
			E('input', {
				'id': id, 'type': 'checkbox',
				'checked': checked ? 'checked' : null
			}))
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('network'),
			uci.load('dhcp')
		]);
	},

	render: function() {
		var self = this;

		function notify(text, kind) {
			ui.addNotification(null, E('p', {}, text), kind || 'info');
		}

		function showForm(mode) {
			document.getElementById('nw-cards').style.display = 'none';
			document.getElementById('nw-head').style.display = 'none';
			document.getElementById('nw-forms').style.display = 'block';
			[ 'pppoe', 'dhcp', 'bypass' ].forEach(function(m) {
				var el = document.getElementById('nw-form-' + m);
				if (el)
					el.style.display = (m === mode) ? 'block' : 'none';
			});
		}

		function hideForms() {
			document.getElementById('nw-forms').style.display = 'none';
			document.getElementById('nw-cards').style.display = 'flex';
			document.getElementById('nw-head').style.display = 'block';
		}

		function writeLan(ip) {
			if (!ip)
				return Promise.resolve();

			return Promise.resolve()
				.then(function() { return callUciSet('network', 'lan', 'ipaddr', ip); });
		}

		function applyMode(mode) {
			var p = Promise.resolve();

			if (mode === 'pppoe') {
				var user = val('ppp-user');
				var pass = val('ppp-pass');
				if (!user || !pass) {
					notify(_('请填写宽带账号和密码'), 'error');
					return Promise.resolve();
				}
				p = p
					.then(function() { return callUciSet('network', 'wan', 'proto', 'pppoe'); })
					.then(function() { return callUciSet('network', 'wan', 'username', user); })
					.then(function() { return callUciSet('network', 'wan', 'password', pass); })
					.then(function() { return callUciSet('network', 'wan', 'keepalive', '1'); })
					.then(function() { return writeLan(val('ppp-lan')); });
			}
			else if (mode === 'dhcp') {
				p = p
					.then(function() { return callUciSet('network', 'wan', 'proto', 'dhcp'); })
					.then(function() { return writeLan(val('dh-lan')); });
			}
			else if (mode === 'bypass') {
				var bip = val('bp-ip');
				var gw  = val('bp-gw');
				if (!bip || !gw) {
					notify(_('请填写旁路由自身地址和主路由网关'), 'error');
					return Promise.resolve();
				}
				p = p
					.then(function() { return callUciSet('network', 'lan', 'ipaddr', bip); })
					.then(function() { return callUciSet('network', 'lan', 'gateway', gw); })
					.then(function() { return callUciSet('network', 'lan', 'dns', gw); })
					.then(function() { return callUciSet('network', 'lan', 'delegate', '0'); })
					.then(function() { return callUciSet('dhcp', 'lan', 'ignore', '1'); });
			}

			return p
				.then(function() { return callUciCommit('network'); })
				.then(function() { return callUciCommit('dhcp'); })
				.then(function() { return callUciApply(30); })
				.then(function() {
					notify(_('配置已提交，网络正在重启。若改过 LAN 地址，请用新地址访问后台。'));
				})
				.catch(function(e) {
					notify(_('应用失败：') + e, 'error');
				});
		}

		function card(color, title, desc, mode) {
			return E('div', {
				'style': 'flex:1 1 280px;max-width:340px;min-height:260px;border-radius:14px;' +
					'background:' + color + ';color:#fff;padding:36px 26px;cursor:pointer;' +
					'box-shadow:0 8px 22px rgba(0,0,0,.13);display:flex;flex-direction:column;' +
					'justify-content:center;align-items:center;text-align:center;',
				'click': ui.createHandlerFn(self, function() { showForm(mode); })
			}, [
				E('div', { 'style': 'font-size:24px;font-weight:700;letter-spacing:1px' }, title),
				E('div', { 'style': 'margin-top:16px;font-size:13px;line-height:1.8;opacity:.92' }, desc),
				E('div', { 'style': 'margin-top:26px;font-size:13px;border:1px solid rgba(255,255,255,.75);' +
					'border-radius:18px;padding:6px 18px' }, _('开始配置'))
			]);
		}

		function box(id, title, hint, body, mode) {
			return E('div', {
				'id': id,
				'style': 'display:none;background:var(--background-color,#fff);border-radius:12px;' +
					'padding:26px;margin:0 auto;max-width:720px;box-shadow:0 2px 12px rgba(0,0,0,.07)'
			}, [
				E('h3', { 'style': 'margin-top:0' }, title),
				E('p', { 'style': 'color:#888;font-size:13px;line-height:1.7;margin-top:-6px' }, hint),
				body,
				E('div', { 'style': 'margin-top:22px;display:flex;gap:12px;flex-wrap:wrap' }, [
					E('button', {
						'class': 'cbi-button cbi-button-apply',
						'click': ui.createHandlerFn(self, function() { return applyMode(mode); })
					}, _('保存并应用')),
					E('button', {
						'class': 'cbi-button cbi-button-reset',
						'click': ui.createHandlerFn(self, hideForms)
					}, _('返回'))
				])
			]);
		}

		return E([
			E('div', { 'id': 'nw-head', 'style': 'text-align:center;padding:24px 0 8px' }, [
				E('h2', { 'style': 'font-size:28px;margin:0' }, _('欢迎使用网络配置向导')),
				E('p', { 'style': 'color:#7a7a7a;margin-top:10px' }, _('选择一种连接方式以开始'))
			]),

			E('div', {
				'id': 'nw-cards',
				'style': 'display:flex;gap:22px;justify-content:center;flex-wrap:wrap;padding:20px 12px'
			}, [
				card('#f56c6c', _('宽带拨号连接'),
					_('使用运营商提供的宽带账号密码拨号上网（PPPoE）'), 'pppoe'),
				card('#3ac569', _('连接现有路由器'),
					_('本机作为主路由，WAN 口自动获取上级路由器分配的地址'), 'dhcp'),
				card('#5b9bf8', _('配置为旁路由'),
					_('接在现有路由器下面，只负责代理与分流，不改动主网络结构'), 'bypass')
			]),

			E('div', { 'style': 'text-align:center;margin:8px 0 30px' }, [
				E('a', {
					'href': L.url('admin/services/netwizard/advanced'),
					'style': 'color:#4a90e2;font-size:13px;text-decoration:none'
				}, _('没找到想要的配置？请使用高级模式'))
			]),

			E('div', { 'id': 'nw-forms' }, [
				box('nw-form-pppoe', _('宽带拨号连接 (PPPoE)'),
					_('填入运营商给的宽带账号密码。WAN 口会以 PPPoE 方式拨号。'),
					E([
						field('ppp-user', _('宽带账号'), '', '例如 0531xxxxxxxx'),
						field('ppp-pass', _('宽带密码'), '', '', 'password'),
						field('ppp-lan', _('LAN 地址（可留空保持当前）'),
							uci.get('network', 'lan', 'ipaddr'), '10.0.0.1')
					]), 'pppoe'),

				box('nw-form-dhcp', _('连接现有路由器 (WAN 自动获取)'),
					_('本机当作主路由使用，WAN 口从上级光猫或路由器自动获取 IPv4。'),
					E([
						field('dh-lan', _('LAN 地址（可留空保持当前）'),
							uci.get('network', 'lan', 'ipaddr'), '10.0.0.1')
					]), 'dhcp'),

				box('nw-form-bypass', _('配置为旁路由'),
					_('旁路由模式会关闭本机 DHCP，由主路由继续分配地址；本机只处理需要走代理的流量。请先给本机一个主路由网段内的空闲地址。'),
					E([
						field('bp-ip', _('旁路由自身地址'), uci.get('network', 'lan', 'ipaddr'), '192.168.1.2'),
						field('bp-gw', _('主路由网关'), uci.get('network', 'lan', 'gateway'), '192.168.1.1')
					]), 'bypass')
			])
		]);
	}
});
