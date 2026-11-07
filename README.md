# ImmortalWrt x86-64 PVE 定制构建

基于 [ImmortalWrt](https://github.com/immortalwrt/immortalwrt) 官方主线（x86/64 通用目标）的自动化构建仓库，
面向 Proxmox VE / KVM 虚拟机部署。每周自动合并上游并编译，产出可直接导入 PVE 的 qcow2 镜像。

- 上游仓库：<https://github.com/immortalwrt/immortalwrt>
- 本仓库：`xiaoran0503/immortalwrt`
- 构建流水线：`.github/workflows/build.yml`

---

## 一、这个仓库改了什么

| 项目 | 默认值 / 行为 | 落点 |
|---|---|---|
| LAN 地址 | `192.168.3.19/24`（按需换成你网段里的空闲地址） | `package/immortalwrt-custom/files/etc/uci-defaults/99-immortalwrt-custom` |
| DHCP 池 | 从 `.100` 起，150 个地址，租约 12h | 同上 |
| IPv6 | WAN6 走 DHCPv6 客户端（`reqaddress=try`、`reqprefix=auto`），LAN 开 RA + DHCPv6 服务，`ip6assign=60` | 同上 |
| 防火墙 | wan6 已并入 wan zone，避免 IPv6 进出被丢 | 同上 |
| 流量卸载 | 开 nftables **软件** flow offloading，关硬件卸载（虚拟化无意义） | 同上 |
| 界面语言 | 默认 `zh_cn` | 同上 |
| 主题 | Argon（`luci-theme-argon`） | 同上 |
| 时区 / NTP | `Asia/Shanghai`，`ntp.aliyun.com` / `cn.pool.ntp.org` / 腾讯云 | 同上 |
| 内核参数 | conntrack 131072、somaxconn 4096、tcp_fastopen、端口范围放大 | `.../etc/sysctl.d/99-custom.conf` |
| 网络向导 | 新增 LuCI 页面「服务 → 网络向导」，一页改 LAN/DHCP/IPv6 | `package/luci-app-netwizard/` |
| PassWall | `luci-app-passwall` + `xray-core` + `sing-box` 全部来自 ImmortalWrt 自有源 | `.config`（workflow 内生成） |

**设计原则：不改任何上游源码文件**。所有定制都以「新增文件 + 首次启动 uci 脚本」的形式存在，
因此每周 `git merge upstream/master` 不会产生冲突。这一点决定了方案能不能长期无人值守跑下去。

---

## 二、构建产物

每次 Release 包含：

- `immortalwrt-x86-64-pve-generic-squashfs-combined.qcow2` — BIOS/SeaBIOS 引导（推荐）
- `immortalwrt-x86-64-pve-generic-squashfs-combined-efi.qcow2` — UEFI/OVMF 引导
- `SHA256SUMS.txt`

`squashfs` 类型支持 `sysupgrade` 时保留配置，PVE 里升级比较方便。

---

## 三、PVE 部署

```bash
# 1. 上传 qcow2 到 PVE 节点
scp immortalwrt-x86-64-pve-generic-squashfs-combined.qcow2 root@pve:/var/lib/vz/template/iso/

# 2. 建虚拟机（ID 按你的规划改）
qm create 100 --name immortalwrt --memory 2048 --cores 2 --cpu host \
  --net0 virtio,bridge=vmbr0 --machine q35 --scsihw virtio-scsi-pci

# 3. 导入磁盘
qm importdisk 100 /var/lib/vz/template/iso/immortalwrt-x86-64-pve-generic-squashfs-combined.qcow2 local-lvm

# 4. 挂上磁盘并设引导顺序
qm set 100 --scsi0 local-lvm:vm-100-disk-0
qm set 100 --boot order=scsi0

# 5. 串口控制台（OpenWrt 默认有串口输出，方便排障）
qm set 100 --serial0 socket

# 6. 启动
qm start 100
```

启动后等 30-60 秒，浏览器访问 **<http://192.168.3.19>** 即可。

### PVE 侧建议参数

| 项 | 建议 | 原因 |
|---|---|---|
| CPU 类型 | `host` | 让 virtio、AES-NI 走原生指令，别用 `kvm64` |
| vCPU 数量 | 2 | 软路由吃单核性能和网卡中断，堆核无效 |
| 网卡 | `virtio` + 多队列 | 见下 |
| Ballooning | 关闭 | 内存气球会拖慢收发包路径 |
| 磁盘缓存 | `none`（默认） | — |

网卡多队列在 PVE 宿主机上这样加（每个网卡 8 队列）：

```bash
qm set 100 --net0 virtio,bridge=vmbr0,queues=8
```

多队列是否生效，进系统后看：

```bash
ls /sys/class/net/eth0/queues/rx-*/   # 有 rx-0..rx-7 说明 8 队列已生效
ethtool -l eth0                        # 复核对列数
```

### 首次登录

1. 浏览器打开 `http://192.168.3.19`
2. 用「服务 → 网络向导」改 LAN 网段、DHCP 池、IPv6 模式（中文界面，一页改完）
3. 系统 → 管理权 → 设置 root 密码（**镜像默认无密码，务必先设**）

---

## 四、每周自动同步上游

`build.yml` 的触发方式：

| 触发 | 说明 |
|---|---|
| `schedule: 0 18 * * 0` | 每周一 02:00（北京时间）自动跑：合并上游 → 编译 → 发 Release |
| `workflow_dispatch` | Actions 页面手动点「Run workflow」 |
| `push` | 改动了 `package/**` 或 workflow 文件时自动触发 |

同步逻辑在 `同步上游 ImmortalWrt` 步骤里：`git fetch upstream master` + `git merge` + `git push origin master`。
因为定制全部是新增文件，合并不会冲突；万一上游改了同名路径导致冲突，这一步会显式失败并打印冲突文件列表，不会静默糊弄过去。

> 注意：fork 仓库的 Actions 需要在仓库 Settings → Actions → General 里确认已启用，
> 且 schedule 触发要求仓库 60 天内有提交——本流水线每周都会推一次合并提交，所以不会被动禁用。

### 编译资源

- 单次全量编译约 3–4 小时（含 passwall 的 Go 内核交叉编译）
- 公开仓库 Actions 分钟数免费，用 `concurrency` 保证同一时间只跑一个，不会叠加烧额度
- `dl` 目录走 Actions 缓存，第二次之后能省掉大半下载时间

---

## 五、手动本地编译（兜底）

GitHub 不通时可在本机 WSL 里编：

```bash
# Ubuntu 26.04 里
sudo apt install -y build-essential clang flex bison g++ gawk gcc-multilib \
  g++-multilib gettext git libncurses-dev libssl-dev python3 rsync swig \
  zlib1g-dev unzip zip qemu-utils

git clone https://github.com/xiaoran0503/immortalwrt.git
cd immortalwrt
./scripts/feeds update -a && ./scripts/feeds install -a
cp /path/to/my.config .config     # 或用 workflow 里那份 .config 片段
make defconfig && make -j$(nproc)

# 出完后转 qcow2
qemu-img convert -f raw -O qcow2 -o cluster_size=4096 \
  bin/targets/x86/64/*generic-squashfs-combined.img \
  immortalwrt-pve.qcow2
```

磁盘预留 40GB 以上。

---

## 六、已知边界

- **PassWall 只装软件，不含节点**。节点、订阅、分流规则需要自己配，这部分不在本仓库范围内，请按所在地法规和实际用途自行判断使用场景。
- **qemu-guest-agent 未预装**（OpenWrt 的包名和 PVE 侧匹配需要单独验证），关机请用 ACPI 或 SSH。
- **IPv6 依赖运营商下发**。WAN6 是 DHCPv6 客户端，若运营商不分配前缀，LAN 侧只有 ULA，属正常。
- 未开启 WiFi（x86 无无线网卡，无线由外接 AP 负责）。
