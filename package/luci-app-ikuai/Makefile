include $(TOPDIR)/rules.mk

LUCI_TITLE:=ImmortalWrt 简洁控制台（仿爱快式总览首页 + 回切原生界面入口）
LUCI_DESCRIPTION:=A calm Chinese overview dashboard for ImmortalWrt: system status, traffic curve, online terminals and dialup/proxy state. Advanced settings stay in native LuCI.
LUCI_DEPENDS:=+luci-base +luci-theme-argon
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-ikuai
PKG_VERSION:=1.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=xiaoran0503

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
