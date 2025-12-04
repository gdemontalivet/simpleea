/**
 * Safe storage wrapper that handles sandboxed iframe environments
 * Falls back to in-memory storage when localStorage is unavailable
 */

class SafeStorage {
  private memoryStorage: Map<string, string> = new Map()
  private isLocalStorageAvailable: boolean

  constructor() {
    this.isLocalStorageAvailable = this.checkLocalStorageAvailability()
  }

  private checkLocalStorageAvailability(): boolean {
    try {
      const testKey = '__storage_test__'
      localStorage.setItem(testKey, 'test')
      localStorage.removeItem(testKey)
      return true
    } catch (e) {
      console.warn('localStorage is not available, using in-memory storage fallback')
      return false
    }
  }

  getItem(key: string): string | null {
    if (this.isLocalStorageAvailable) {
      try {
        return localStorage.getItem(key)
      } catch (e) {
        console.error('Error reading from localStorage:', e)
        this.isLocalStorageAvailable = false
      }
    }
    return this.memoryStorage.get(key) || null
  }

  setItem(key: string, value: string): void {
    if (this.isLocalStorageAvailable) {
      try {
        localStorage.setItem(key, value)
        return
      } catch (e) {
        console.error('Error writing to localStorage:', e)
        this.isLocalStorageAvailable = false
      }
    }
    this.memoryStorage.set(key, value)
  }

  removeItem(key: string): void {
    if (this.isLocalStorageAvailable) {
      try {
        localStorage.removeItem(key)
        return
      } catch (e) {
        console.error('Error removing from localStorage:', e)
        this.isLocalStorageAvailable = false
      }
    }
    this.memoryStorage.delete(key)
  }

  clear(): void {
    if (this.isLocalStorageAvailable) {
      try {
        localStorage.clear()
        return
      } catch (e) {
        console.error('Error clearing localStorage:', e)
        this.isLocalStorageAvailable = false
      }
    }
    this.memoryStorage.clear()
  }
}

// Export a singleton instance
export const safeStorage = new SafeStorage()
