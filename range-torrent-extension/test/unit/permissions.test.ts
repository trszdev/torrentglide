import { expect, test } from 'bun:test'
import { hostOf, hostPermissionFor, isLocalAddress } from '../../src/services/permissions.ts'

test('hostPermissionFor covers every port of the host', () => {
  expect(hostPermissionFor('http://localhost:3030')).toBe('http://localhost/*')
  expect(hostPermissionFor('https://nas.lan/rqbit')).toBe('https://nas.lan/*')
})

test('isLocalAddress is true for this computer only', () => {
  expect(isLocalAddress('http://localhost:3030')).toBe(true)
  expect(isLocalAddress('http://127.0.0.1:3030')).toBe(true)
  expect(isLocalAddress('http://[::1]:3030')).toBe(true)
  expect(isLocalAddress('http://rqbit.localhost')).toBe(true)
  expect(isLocalAddress('http://192.168.1.20:3030')).toBe(false)
  expect(isLocalAddress('https://nas.lan/rqbit')).toBe(false)
})

test('hostOf names the host and port the texts show', () => {
  expect(hostOf('http://localhost:3030')).toBe('localhost:3030')
  expect(hostOf('https://nas.lan/rqbit')).toBe('nas.lan')
})
