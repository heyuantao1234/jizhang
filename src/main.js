import { initDatabase, getDatabase } from './database.js'

// 全局状态
let allMembers = []
let deleteTargetId = null

// 初始化
async function init() {
  try {
    await initDatabase()
    await loadMembers()
  } catch (error) {
    console.error('初始化失败:', error)
    alert('系统初始化失败: ' + error.message)
  }
}

// 加载会员列表
async function loadMembers() {
  const db = getDatabase()
  allMembers = await db.getAllMembers()
  renderMembers(allMembers)
  updateStats()
}

// 渲染会员列表
function renderMembers(members) {
  const listEl = document.getElementById('membersList')
  const titleEl = document.getElementById('listTitle')

  if (members.length === 0) {
    titleEl.textContent = '📋 全部会员'
    listEl.innerHTML = '<div class="empty-state">暂无会员，点击上方按钮添加</div>'
    return
  }

  titleEl.textContent = `📋 全部会员 (${members.length}人)`

  listEl.innerHTML = members.map(m => {
    const isLowBalance = m.balance < m.alertThreshold
    return `
    <div class="member-card ${isLowBalance ? 'low-balance' : ''}">
      ${isLowBalance ? '<div class="alert-badge">⚠️ 余额不足</div>' : ''}
      <div class="member-main" onclick="openMemberDetail(${m.id})">
        <div class="member-avatar">${m.name.charAt(0)}</div>
        <div class="member-info">
          <div class="member-name">${m.name}</div>
          <div class="member-phone">${formatPhone(m.phone)}</div>
          ${m.note ? `<div class="member-note">${m.note}</div>` : ''}
        </div>
        <div class="member-balance ${m.balance > 0 ? 'positive' : 'zero'}">
          ¥${m.balance.toFixed(2)}
        </div>
      </div>
      <div class="member-actions">
        <button onclick="openQuickEdit(${m.id}, 'deposit')" class="action-btn-small deposit">💰 存</button>
        <button onclick="openQuickEdit(${m.id}, 'withdraw')" class="action-btn-small withdraw">💸 取</button>
        <button onclick="showQRCode(${m.id})" class="action-btn-small">📱</button>
        <button onclick="showDeleteModal(${m.id})" class="action-btn-small delete">🗑️</button>
      </div>
    </div>
  `}).join('')
}

// 更新统计数据
function updateStats() {
  document.getElementById('totalMembers').textContent = allMembers.length
  const total = allMembers.reduce((sum, m) => sum + m.balance, 0)
  document.getElementById('totalBalance').textContent = `¥${total.toFixed(2)}`
}

// 搜索会员
async function searchMembers() {
  const keyword = document.getElementById('searchInput').value.trim()
  const db = getDatabase()

  if (!keyword) {
    renderMembers(allMembers)
    document.getElementById('listTitle').textContent = '📋 全部会员'
    return
  }

  const results = await db.searchMembers(keyword)
  document.getElementById('listTitle').textContent = `🔍 搜索结果: "${keyword}" (${results.length}人)`
  renderMembers(results)
}

// 显示全部会员
async function showAllMembers() {
  document.getElementById('searchInput').value = ''
  await loadMembers()
}

// 显示新增会员弹窗
function showAddMemberForm() {
  document.getElementById('addMemberModal').classList.add('show')
  document.getElementById('addMemberForm').reset()
  document.getElementById('memberId').value = ''
}

// 关闭新增会员弹窗
function closeAddMemberForm() {
  document.getElementById('addMemberModal').classList.remove('show')
}

// 保存会员
async function saveMember(event) {
  event.preventDefault()

  const id = document.getElementById('memberId').value
  const name = document.getElementById('memberName').value
  const phone = document.getElementById('memberPhone').value
  const amount = document.getElementById('memberAmount').value
  const note = document.getElementById('memberNote').value

  if (!name || !phone) {
    alert('请填写姓名和手机号')
    return
  }

  if (!/^\d{11}$/.test(phone)) {
    alert('手机号格式不正确')
    return
  }

  const db = getDatabase()

  try {
    if (id) {
      await db.updateMember(parseInt(id), name, phone, note)
      alert('会员信息已更新')
    } else {
      if (!amount || parseFloat(amount) <= 0) {
        alert('请输入存入金额')
        return
      }
      await db.addMember(name, phone, amount, note)
      alert('会员添加成功')
    }

    closeAddMemberForm()
    await loadMembers()
  } catch (error) {
    console.error('保存失败:', error)
    alert('保存失败: ' + error.message)
  }
}

// 打开会员详情（消费记录）
async function openMemberDetail(memberId) {
  const member = allMembers.find(m => m.id === memberId)
  if (!member) return

  const db = getDatabase()
  const history = await db.getTransactions(memberId, 50) // 获取更多记录
  const stats = await db.getMemberStats(memberId)

  // 填充详情弹窗
  document.getElementById('detailMemberId').value = memberId
  document.getElementById('detailMemberName').textContent = member.name
  document.getElementById('detailMemberPhone').textContent = member.phone
  document.getElementById('detailMemberBalance').textContent = `¥${member.balance.toFixed(2)}`
  document.getElementById('detailTotalDeposit').textContent = `¥${stats.totalDeposit.toFixed(2)}`
  document.getElementById('detailTotalWithdraw').textContent = `¥${stats.totalWithdraw.toFixed(2)}`

  // 渲染消费记录
  renderTransactionList(history)

  document.getElementById('memberDetailModal').classList.add('show')
}

// 渲染交易记录列表
function renderTransactionList(transactions) {
  const el = document.getElementById('transactionList')

  if (transactions.length === 0) {
    el.innerHTML = '<div class="empty-state small">暂无交易记录</div>'
    return
  }

  el.innerHTML = transactions.map(h => `
    <div class="transaction-item">
      <div class="transaction-info">
        <span class="transaction-type ${h.type}">${h.type === 'deposit' ? '💰 存入' : '💸 消费'}</span>
        ${h.note ? `<span class="transaction-note">${h.note}</span>` : ''}
      </div>
      <div class="transaction-right">
        <span class="transaction-amount ${h.type}">${h.type === 'deposit' ? '+' : '-'}¥${h.amount.toFixed(2)}</span>
        <span class="transaction-balance">余额: ¥${h.balanceAfter.toFixed(2)}</span>
        <span class="transaction-date">${formatDateTime(h.createdAt)}</span>
      </div>
    </div>
  `).join('')
}

// 关闭会员详情
function closeMemberDetail() {
  document.getElementById('memberDetailModal').classList.remove('show')
}

// 打开快速编辑弹窗
async function openQuickEdit(memberId, defaultType = null) {
  const member = allMembers.find(m => m.id === memberId)
  if (!member) return

  document.getElementById('quickMemberId').value = memberId
  document.getElementById('quickMemberName').textContent = member.name
  document.getElementById('quickMemberBalance').textContent = `¥${member.balance.toFixed(2)}`
  document.getElementById('quickNote').value = ''
  document.getElementById('customAmount').value = ''

  const type = defaultType || 'deposit'
  document.getElementById('quickEditType').value = type
  document.getElementById('amountTypeBtn').textContent = type === 'deposit' ? '存入' : '取出'
  document.getElementById('amountTypeBtn').className = `type-btn ${type}`

  document.getElementById('quickEditTitle').textContent =
    type === 'deposit' ? '💰 存入金额' : '💸 取出金额'

  const db = getDatabase()
  const history = await db.getTransactions(memberId, 5)
  renderHistory(history)

  document.getElementById('quickEditModal').classList.add('show')
}

// 渲染历史记录
function renderHistory(history) {
  const el = document.getElementById('quickHistory')

  if (history.length === 0) {
    el.innerHTML = '<div class="empty-state small">暂无记录</div>'
    return
  }

  el.innerHTML = history.map(h => `
    <div class="history-item">
      <span class="history-type ${h.type}">${h.type === 'deposit' ? '存入' : '消费'}</span>
      <span class="history-amount ${h.type}">${h.type === 'deposit' ? '+' : '-'}¥${h.amount.toFixed(2)}</span>
      <span class="history-date">${formatDateTime(h.createdAt)}</span>
      ${h.note ? `<span class="history-note">${h.note}</span>` : ''}
    </div>
  `).join('')
}

// 关闭快速编辑
function closeQuickEdit() {
  document.getElementById('quickEditModal').classList.remove('show')
}

// 切换金额类型
function toggleAmountType() {
  const current = document.getElementById('quickEditType').value
  const newType = current === 'deposit' ? 'withdraw' : 'deposit'
  document.getElementById('quickEditType').value = newType
  document.getElementById('amountTypeBtn').textContent = newType === 'deposit' ? '存入' : '取出'
  document.getElementById('amountTypeBtn').className = `type-btn ${newType}`
  document.getElementById('quickEditTitle').textContent =
    newType === 'deposit' ? '💰 存入金额' : '💸 取出金额'
}

// 快速添加金额
async function quickAddAmount(amount) {
  await applyAmount(amount)
}

// 应用自定义金额
async function applyCustomAmount() {
  const amount = parseFloat(document.getElementById('customAmount').value)
  if (!amount || amount <= 0) {
    alert('请输入有效金额')
    return
  }
  await applyAmount(amount)
}

// 应用金额变动
async function applyAmount(amount) {
  const memberId = parseInt(document.getElementById('quickMemberId').value)
  const type = document.getElementById('quickEditType').value
  const note = document.getElementById('quickNote').value

  const db = getDatabase()

  try {
    const newBalance = await db.updateBalance(memberId, amount, type, note)

    document.getElementById('quickMemberBalance').textContent = `¥${newBalance.toFixed(2)}`
    document.getElementById('customAmount').value = ''
    document.getElementById('quickNote').value = ''

    await loadMembers()

    const history = await db.getTransactions(memberId, 5)
    renderHistory(history)

  } catch (error) {
    console.error('操作失败:', error)
    alert(error.message || '操作失败')
  }
}

// 显示二维码弹窗
function showQRCode(memberId) {
  const member = allMembers.find(m => m.id === memberId)
  if (!member) return

  document.getElementById('qrMemberName').textContent = member.name
  document.getElementById('qrMemberPhone').textContent = member.phone
  document.getElementById('qrMemberBalance').textContent = `¥${member.balance.toFixed(2)}`

  // 生成二维码内容（会员ID+手机号）
  const qrData = `MEMBER:${member.id}:${member.phone}`
  generateQRCode('qrcode', qrData)

  document.getElementById('qrModal').classList.add('show')
}

// 生成二维码
function generateQRCode(elementId, data) {
  const el = document.getElementById(elementId)
  el.innerHTML = ''

  // 简单的二维码生成（使用QRCode.js CDN）
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
  script.onload = () => {
    QRCode.toCanvas(data, { width: 200 }, (error, canvas) => {
      if (error) {
        el.innerHTML = '<div class="qr-error">二维码生成失败</div>'
        return
      }
      canvas.id = 'qr-canvas'
      el.appendChild(canvas)
    })
  }
  script.onerror = () => {
    el.innerHTML = `<div class="qr-fallback">会员ID: ${data.split(':')[1]}</div>`
  }
  document.head.appendChild(script)
}

// 关闭二维码弹窗
function closeQRModal() {
  document.getElementById('qrModal').classList.remove('show')
  document.getElementById('qrcode').innerHTML = ''
}

// 显示删除确认
function showDeleteModal(id) {
  deleteTargetId = id
  document.getElementById('deleteModal').classList.add('show')
}

// 关闭删除确认
function closeDeleteModal() {
  deleteTargetId = null
  document.getElementById('deleteModal').classList.remove('show')
}

// 确认删除
async function confirmDelete() {
  if (!deleteTargetId) return

  const db = getDatabase()
  try {
    await db.deleteMember(deleteTargetId)
    closeDeleteModal()
    await loadMembers()
    alert('会员已删除')
  } catch (error) {
    console.error('删除失败:', error)
    alert('删除失败: ' + error.message)
  }
}

// 显示统计报表
async function showStats() {
  const db = getDatabase()
  const stats = await db.getAllStats()
  const todayStats = await db.getTodayStats()
  const monthStats = await db.getMonthStats()

  document.getElementById('statsTotalDeposit').textContent = `¥${stats.totalDeposit.toFixed(2)}`
  document.getElementById('statsTotalWithdraw').textContent = `¥${stats.totalWithdraw.toFixed(2)}`
  document.getElementById('statsTotalBalance').textContent = `¥${stats.totalBalance.toFixed(2)}`
  document.getElementById('statsMemberCount').textContent = `${stats.memberCount}人`

  document.getElementById('statsTodayDeposit').textContent = `¥${todayStats.deposit.toFixed(2)}`
  document.getElementById('statsTodayWithdraw').textContent = `¥${todayStats.withdraw.toFixed(2)}`

  document.getElementById('statsMonthDeposit').textContent = `¥${monthStats.deposit.toFixed(2)}`
  document.getElementById('statsMonthWithdraw').textContent = `¥${monthStats.withdraw.toFixed(2)}`

  // 渲染本月 Top 消费会员
  const topSpenders = await db.getTopSpenders(5)
  renderTopSpenders(topSpenders)

  document.getElementById('statsModal').classList.add('show')
}

// 渲染Top消费会员
function renderTopSpenders(topSpenders) {
  const el = document.getElementById('topSpendersList')

  if (topSpenders.length === 0) {
    el.innerHTML = '<div class="empty-state small">暂无数据</div>'
    return
  }

  el.innerHTML = topSpenders.map((m, i) => `
    <div class="top-spender-item">
      <span class="rank">${i + 1}</span>
      <span class="name">${m.name}</span>
      <span class="amount">¥${m.totalSpend.toFixed(2)}</span>
    </div>
  `).join('')
}

// 关闭统计弹窗
function closeStatsModal() {
  document.getElementById('statsModal').classList.remove('show')
}

// 导出数据
async function exportData() {
  const db = getDatabase()
  try {
    const data = await db.exportAll()
    const json = JSON.stringify(data, null, 2)

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `会员余额_${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    alert('数据导出成功')
  } catch (error) {
    console.error('导出失败:', error)
    alert('导出失败: ' + error.message)
  }
}

// 导入数据
function importData() {
  document.getElementById('importFile').click()
}

async function handleImport(event) {
  const file = event.target.files[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)

    const db = getDatabase()
    const count = await db.importAll(data)
    await loadMembers()

    alert(`成功导入 ${count} 条会员数据`)
  } catch (error) {
    console.error('导入失败:', error)
    alert('导入失败: ' + error.message)
  }
}

// 格式化手机号
function formatPhone(phone) {
  if (phone.length === 11) {
    return phone.slice(0, 3) + '****' + phone.slice(-4)
  }
  return phone
}

// 格式化日期时间
function formatDateTime(isoString) {
  const d = new Date(isoString)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours().toString().padStart(2, '0')
  const minute = d.getMinutes().toString().padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}

// 导出给全局使用
window.searchMembers = searchMembers
window.showAllMembers = showAllMembers
window.showAddMemberForm = showAddMemberForm
window.closeAddMemberForm = closeAddMemberForm
window.saveMember = saveMember
window.openMemberDetail = openMemberDetail
window.closeMemberDetail = closeMemberDetail
window.openQuickEdit = openQuickEdit
window.closeQuickEdit = closeQuickEdit
window.toggleAmountType = toggleAmountType
window.quickAddAmount = quickAddAmount
window.applyCustomAmount = applyCustomAmount
window.showQRCode = showQRCode
window.closeQRModal = closeQRModal
window.showDeleteModal = showDeleteModal
window.closeDeleteModal = closeDeleteModal
window.confirmDelete = confirmDelete
window.showStats = showStats
window.closeStatsModal = closeStatsModal
window.exportData = exportData
window.importData = importData

// 启动
init()
