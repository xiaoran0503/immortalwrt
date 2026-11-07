include $(TOPDIR)/rules.mk

PKG_NAME:=immortalwrt-custom
PKG_VERSION:=1.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)

include $(INCLUDE_DIR)/package.mk

define Package/immortalwrt-custom
	SECTION:=utils
	CATEGORY:=Utilities
	TITLE:=ImmortalWrt PVE 首次启动默认配置
	PKGARCH:=all
endef

define Package/immortalwrt-custom/description
	PVE 部署用的首次启动默认值：LAN 网段、DHCP、IPv6、流量卸载、
	中文界面、时区、NTP、内核参数。
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Compile
endef

define Package/immortalwrt-custom/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-immortalwrt-custom $(1)/etc/uci-defaults/99-immortalwrt-custom
	$(INSTALL_DIR) $(1)/etc/sysctl.d
	$(INSTALL_CONF) ./files/etc/sysctl.d/99-custom.conf $(1)/etc/sysctl.d/99-custom.conf
endef

$(eval $(call BuildPackage,immortalwrt-custom))
