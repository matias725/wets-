// Guarda en el navegador (IndexedDB) los datos SAP cargados desde la página.
// localStorage no sirve: los datos pesan varios MB.
const DB = 'westia'
const STORE = 'datos'
const KEY = 'sap'

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run(mode, fn) {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export const loadSapData = () => run('readonly', (s) => s.get(KEY))
export const saveSapData = (data) => run('readwrite', (s) => s.put(data, KEY))
export const clearSapData = () => run('readwrite', (s) => s.delete(KEY))
