/**
 * IndexedDB 数据库封装 - 会员余额管理系统
 */

let dbInstance = null
const DB_NAME = 'member_balance.db'
const DB_VERSION = 2 // 升级版本号

// 初始化数据库
export async function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(new Error('无法打开数据库'))

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // 会员表
      if (!db.objectStoreNames.contains('members')) {
        const memberStore = db.createObjectStore('members', {
          keyPath: 'id',
          autoIncrement: true
        })
        memberStore.createIndex('name', 'name', { unique: false })
        memberStore.createIndex('phone', 'phone', { unique: false })
        memberStore.createIndex('createdAt', 'createdAt', { unique: false })
      }

      // 操作记录表
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', {
          keyPath: 'id',
          autoIncrement: true
        })
        txStore.createIndex('memberId', 'memberId', { unique: false })
        txStore.createIndex('createdAt', 'createdAt', { unique: false })
        txStore.createIndex('type', 'type', { unique: false })
      }
    }

    request.onsuccess = (event) => {
      const db = event.target.result
      dbInstance = createDatabaseWrapper(db)
      console.log('数据库初始化成功')
      resolve()
    }

    request.onerror = () => reject(new Error('数据库初始化失败'))
  })
}

// 创建数据库封装
function createDatabaseWrapper(db) {
  return {
    // 获取所有会员
    getAllMembers: () => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['members'], 'readonly')
        const store = transaction.objectStore('members')
        const request = store.getAll()

        request.onsuccess = () => {
          const results = request.result.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
          )
          resolve(results)
        }
        request.onerror = () => reject(request.error)
      })
    },

    // 搜索会员
    searchMembers: (keyword) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['members'], 'readonly')
        const store = transaction.objectStore('members')
        const request = store.getAll()

        request.onsuccess = () => {
          const kw = keyword.toLowerCase().trim()
          const results = request.result.filter(m =>
            m.name.toLowerCase().includes(kw) ||
            m.phone.includes(kw)
          ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          resolve(results)
        }
        request.onerror = () => reject(request.error)
      })
    },

    // 添加会员
    addMember: (name, phone, amount, note) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['members', 'transactions'], 'readwrite')
        const memberStore = transaction.objectStore('members')
        const txStore = transaction.objectStore('transactions')

        const member = {
          name: name.trim(),
          phone: phone.trim(),
          balance: parseFloat(amount),
          alertThreshold: 100, // 默认余额提醒阈值
          note: note?.trim() || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        const addRequest = memberStore.add(member)

        addRequest.onsuccess = () => {
          const memberId = addRequest.result

          const txRecord = {
            memberId,
            type: 'deposit',
            amount: parseFloat(amount),
            balanceBefore: 0,
            balanceAfter: parseFloat(amount),
            note: '新会员注册存入',
            createdAt: new Date().toISOString()
          }
          txStore.add(txRecord)

          resolve(memberId)
        }
        addRequest.onerror = () => reject(addRequest.error)
      })
    },

    // 更新会员信息
    updateMember: (id, name, phone, note) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['members'], 'readwrite')
        const store = transaction.objectStore('members')
        const getRequest = store.get(id)

        getRequest.onsuccess = () => {
          const member = getRequest.result
          if (!member) {
            reject(new Error('会员不存在'))
            return
          }

          member.name = name.trim()
          member.phone = phone.trim()
          member.note = note?.trim() || ''
          member.updatedAt = new Date().toISOString()

          const putRequest = store.put(member)
          putRequest.onsuccess = () => resolve()
          putRequest.onerror = () => reject(putRequest.error)
        }
        getRequest.onerror = () => reject(getRequest.error)
      })
    },

    // 金额变动
    updateBalance: (memberId, amount, type, note) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['members', 'transactions'], 'readwrite')
        const memberStore = transaction.objectStore('members')
        const txStore = transaction.objectStore('transactions')

        const getRequest = memberStore.get(memberId)

        getRequest.onsuccess = () => {
          const member = getRequest.result
          if (!member) {
            reject(new Error('会员不存在'))
            return
          }

          const balanceBefore = member.balance
          const changeAmount = parseFloat(amount)

          if (type === 'deposit') {
            member.balance += changeAmount
          } else {
            if (member.balance < changeAmount) {
              reject(new Error('余额不足'))
              return
            }
            member.balance -= changeAmount
          }

          member.updatedAt = new Date().toISOString()

          memberStore.put(member).onsuccess = () => {
            const txRecord = {
              memberId,
              type,
              amount: changeAmount,
              balanceBefore,
              balanceAfter: member.balance,
              note: note?.trim() || (type === 'deposit' ? '存入' : '消费'),
              createdAt: new Date().toISOString()
            }
            txStore.add(txRecord)
            resolve(member.balance)
          }
        }
        getRequest.onerror = () => reject(getRequest.error)
      })
    },

    // 删除会员
    deleteMember: (id) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['members', 'transactions'], 'readwrite')
        const memberStore = transaction.objectStore('members')
        const txStore = transaction.objectStore('transactions')

        memberStore.delete(id).onsuccess = () => {
          const txIndex = txStore.index('memberId')
          const openCursor = txIndex.openCursor(IDBKeyRange.only(id))

          openCursor.onsuccess = (e) => {
            const cursor = e.target.result
            if (cursor) {
              cursor.delete()
              cursor.continue()
            } else {
              resolve()
            }
          }
        }
        memberStore.onerror = () => reject(memberStore.error)
      })
    },

    // 获取会员操作记录
    getTransactions: (memberId, limit = 50) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['transactions'], 'readonly')
        const store = transaction.objectStore('transactions')
        const index = store.index('memberId')
        const request = index.getAll(IDBKeyRange.only(memberId))

        request.onsuccess = () => {
          const results = request.result
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit)
          resolve(results)
        }
        request.onerror = () => reject(request.error)
      })
    },

    // 获取会员统计
    getMemberStats: (memberId) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['transactions'], 'readonly')
        const store = transaction.objectStore('transactions')
        const index = store.index('memberId')
        const request = index.getAll(IDBKeyRange.only(memberId))

        request.onsuccess = () => {
          const txs = request.result
          let totalDeposit = 0
          let totalWithdraw = 0

          txs.forEach(tx => {
            if (tx.type === 'deposit') totalDeposit += tx.amount
            else totalWithdraw += tx.amount
          })

          resolve({
            totalDeposit,
            totalWithdraw,
            transactionCount: txs.length
          })
        }
        request.onerror = () => reject(request.error)
      })
    },

    // 获取全部统计
    getAllStats: () => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['members', 'transactions'], 'readonly')
        const memberStore = transaction.objectStore('members')
        const txStore = transaction.objectStore('transactions')

        const memberRequest = memberStore.getAll()
        const txRequest = txStore.getAll()

        memberRequest.onsuccess = () => {
          txRequest.onsuccess = () => {
            const members = memberRequest.result
            const txs = txRequest.result

            let totalDeposit = 0
            let totalWithdraw = 0

            txs.forEach(tx => {
              if (tx.type === 'deposit') totalDeposit += tx.amount
              else totalWithdraw += tx.amount
            })

            const totalBalance = members.reduce((sum, m) => sum + m.balance, 0)

            resolve({
              totalDeposit,
              totalWithdraw,
              totalBalance,
              memberCount: members.length
            })
          }
        }
        memberRequest.onerror = () => reject(memberRequest.error)
      })
    },

    // 获取今日统计
    getTodayStats: () => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['transactions'], 'readonly')
        const store = transaction.objectStore('transactions')
        const request = store.getAll()

        request.onsuccess = () => {
          const today = new Date()
          today.setHours(0, 0, 0, 0)

          const todayTxs = request.result.filter(tx => {
            return new Date(tx.createdAt) >= today
          })

          let deposit = 0
          let withdraw = 0

          todayTxs.forEach(tx => {
            if (tx.type === 'deposit') deposit += tx.amount
            else withdraw += tx.amount
          })

          resolve({ deposit, withdraw })
        }
        request.onerror = () => reject(request.error)
      })
    },

    // 获取本月统计
    getMonthStats: () => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['transactions'], 'readonly')
        const store = transaction.objectStore('transactions')
        const request = store.getAll()

        request.onsuccess = () => {
          const now = new Date()
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

          const monthTxs = request.result.filter(tx => {
            return new Date(tx.createdAt) >= monthStart
          })

          let deposit = 0
          let withdraw = 0

          monthTxs.forEach(tx => {
            if (tx.type === 'deposit') deposit += tx.amount
            else withdraw += tx.amount
          })

          resolve({ deposit, withdraw })
        }
        request.onerror = () => reject(request.error)
      })
    },

    // 获取消费最多的会员
    getTopSpenders: (limit = 5) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['members', 'transactions'], 'readonly')
        const memberStore = transaction.objectStore('members')
        const txStore = transaction.objectStore('transactions')

        const memberRequest = memberStore.getAll()
        const txRequest = txStore.getAll()

        memberRequest.onsuccess = () => {
          txRequest.onsuccess = () => {
            const members = memberRequest.result
            const txs = txRequest.result

            // 按会员聚合消费金额
            const memberSpend = {}
            txs.filter(tx => tx.type === 'withdraw').forEach(tx => {
              if (!memberSpend[tx.memberId]) memberSpend[tx.memberId] = 0
              memberSpend[tx.memberId] += tx.amount
            })

            // 获取会员信息并排序
            const withSpend = members.map(m => ({
              id: m.id,
              name: m.name,
              totalSpend: memberSpend[m.id] || 0
            })).filter(m => m.totalSpend > 0)
              .sort((a, b) => b.totalSpend - a.totalSpend)
              .slice(0, limit)

            resolve(withSpend)
          }
        }
        memberRequest.onerror = () => reject(memberRequest.error)
      })
    },

    // 导出所有数据
    exportAll: () => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['members', 'transactions'], 'readonly')
        const memberStore = transaction.objectStore('members')
        const txStore = transaction.objectStore('transactions')

        const memberRequest = memberStore.getAll()
        const txRequest = txStore.getAll()

        memberRequest.onsuccess = () => {
          txRequest.onsuccess = () => {
            resolve({
              members: memberRequest.result,
              transactions: txRequest.result,
              exportedAt: new Date().toISOString()
            })
          }
        }
        memberRequest.onerror = () => reject(memberRequest.error)
      })
    },

    // 导入数据
    importAll: (data) => {
      return new Promise((resolve, reject) => {
        if (!data.members || !Array.isArray(data.members)) {
          reject(new Error('无效的数据格式'))
          return
        }

        const transaction = db.transaction(['members', 'transactions'], 'readwrite')
        const memberStore = transaction.objectStore('members')
        const txStore = transaction.objectStore('transactions')

        let imported = 0

        memberStore.clear()
        txStore.clear()

        for (const member of data.members) {
          memberStore.add(member)
          imported++
        }

        if (data.transactions) {
          for (const tx of data.transactions) {
            txStore.add(tx)
          }
        }

        setTimeout(() => resolve(imported), 100)
      })
    }
  }
}

// 获取数据库实例
export function getDatabase() {
  if (!dbInstance) {
    throw new Error('数据库未初始化')
  }
  return dbInstance
}