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

function field(id, label, value, placeholder) {
	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title', 'for': id }, label),
		E('div', { 'class': 'cbi-value-field' },
			E('input', {
				'id': id,
				'class': 'cbi-input-text',
				'type': 'text',
				'value': (value != null) ? value : '',
				'placeholder': placeholder || ''
			})
		)
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
				'id': id,
				'type': 'checkbox',
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

		function val(id) {
			var el = document.getElementById(id);
			return el ? el.value.trim() : '';
		}

		function apply() {
			var lanIp     = val('nw-lan-ip');
			var lanMask   = val('nw-lan-mask');
			var dhcpOn    = document.getElementById('nw-dhcp-on').checked;
			var dhcpStart = val('nw-dhcp-start');
			var dhcpLimit = val('nw-dhcp-limit');
			var raMode    = val('nw-ra');
			var v6Mode    = val('nw-dhcpv6');

			return Promise.resolve()
				.then(function() { return callUciSet('network', 'lan', 'ipaddr', lanIp); })
				.then(function() { return callUciSet('network', 'lan', 'netmask', lanMask); })
				.then(function() { return callUciSet('dhcp', 'lan', 'ignore', dhcpOn ? '0' : '1'); })
				.then(function() { return callUciSet('dhcp', 'lan', 'start', dhcpStart); })
				.then(function() { return callUciSet('dhcp', 'lan', 'limit', dhcpLimit); })
				.then(function() { return callUciSet('dhcp', 'lan', 'ra', raMode); })
				.then(function() { return callUciSet('dhcp', 'lan', 'dhcpv6', v6Mode); })
				.then(function() { return callUciCommit('network'); })
				.then(function() { return callUciCommit('dhcp'); })
				.then(function() { return callUciApply(30); })
				.then(function() {
					ui.addNotification(null, E('p', {},
						_('配置已提交，网络正在重启。若修改了 LAN 地址，请用新地址重新访问后台。')), 'info');
				})
				.catch(function(e) {
					ui.addNotification(null, E('p', {}, _('应用失败：') + e), 'error');
				});
		}

		var dhcpIgnored = uci.get('dhcp', 'lan', 'ignore');
		var dhcpDisabled = (dhcpIgnored === '1' || dhcpIgnored === true);

		return E([
			E('h2', {}, _('网络向导')),
			E('p', { 'class': 'cbi-section-descr' },
				_('在一个页面里改完 LAN 网段、DHCP 地址池和 IPv6 模式，点一次按钮即生效。修改 LAN 地址后需要用新地址重新登录。')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('LAN 基础设置')),
				field('nw-lan-ip', _('IPv4 地址'), uci.get('network', 'lan', 'ipaddr'), '10.0.0.1'),
				field('nw-lan-mask', _('子网掩码'), uci.get('network', 'lan', 'netmask') || '255.255.255.0', '255.255.255.0')
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('DHCP 服务')),
				toggle('nw-dhcp-on', _('启用 DHCP'), !dhcpDisabled),
				field('nw-dhcp-start', _('起始偏移'), uci.get('dhcp', 'lan', 'start') || '100', '100'),
				field('nw-dhcp-limit', _('地址数量'), uci.get('dhcp', 'lan', 'limit') || '150', '150')
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('IPv6 服务')),
				pick('nw-ra', _('RA 路由通告'), uci.get('dhcp', 'lan', 'ra') || 'server', [
					[ 'disabled', _('关闭') ],
					[ 'server',   _('服务器（下发前缀）') ],
					[ 'relay',    _('中继') ],
					[ 'hybrid',   _('混合') ]
				]),
				pick('nw-dhcpv6', _('DHCPv6 模式'), uci.get('dhcp', 'lan', 'dhcpv6') || 'server', [
					[ 'disabled', _('关闭') ],
					[ 'server',   _('服务器') ],
					[ 'relay',    _('中继') ],
					[ 'hybrid',   _('混合') ]
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('div', { 'class': 'cbi-value-field' },
						E('span', { 'class': 'cbi-value-description' },
							_('WAN 侧的 IPv6 拨号（wan6 / DHCPv6 客户端）在「网络 - 接口」里配置，本页不覆盖。')))
				])
			]),

			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(self, function() { return apply(); })
				}, _('保存并应用'))
			])
		]);
	}
});
