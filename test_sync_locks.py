#!/usr/bin/env python3
"""
Test script for sync lock functionality.
Tests:
1. Single user can acquire lock
2. Double sync attempt fails with 409
3. Lock is released after sync completes
4. Concurrent users don't block each other
"""

import asyncio
import sys
from datetime import datetime

# Add project to path
sys.path.insert(0, '/home/kesha/.cursor/worktrees/CASH_PREDICT/aS9hX')

from hktn.infra.database import (
    init_db,
    acquire_sync_lock,
    release_sync_lock,
    is_sync_locked,
    get_sync_lock,
)


def test_basic_lock():
    """Test 1: Basic lock acquisition and release"""
    print("=" * 60)
    print("TEST 1: Basic lock acquisition and release")
    print("=" * 60)
    
    user_id = "test-user-1"
    sync_id = "sync-001"
    
    # Clean up any existing locks
    release_sync_lock(user_id)
    
    # Acquire lock
    result = acquire_sync_lock(user_id, sync_id, ttl_seconds=60)
    assert result == True, "Should acquire lock successfully"
    print("✓ Lock acquired successfully")
    
    # Check if locked
    assert is_sync_locked(user_id) == True, "User should be locked"
    print("✓ is_sync_locked returns True")
    
    # Get lock info
    lock_info = get_sync_lock(user_id)
    assert lock_info is not None, "Lock info should exist"
    assert lock_info["sync_id"] == sync_id, "Sync ID should match"
    print(f"✓ Lock info retrieved: {lock_info}")
    
    # Release lock
    release_sync_lock(user_id)
    assert is_sync_locked(user_id) == False, "User should not be locked after release"
    print("✓ Lock released successfully")
    
    print("✅ TEST 1 PASSED\n")


def test_double_lock():
    """Test 2: Double lock attempt should fail"""
    print("=" * 60)
    print("TEST 2: Double lock attempt (race condition)")
    print("=" * 60)
    
    user_id = "test-user-2"
    sync_id_1 = "sync-002"
    sync_id_2 = "sync-003"
    
    # Clean up
    release_sync_lock(user_id)
    
    # First lock should succeed
    result1 = acquire_sync_lock(user_id, sync_id_1, ttl_seconds=60)
    assert result1 == True, "First lock should succeed"
    print(f"✓ First lock acquired (sync_id={sync_id_1})")
    
    # Second lock should fail
    result2 = acquire_sync_lock(user_id, sync_id_2, ttl_seconds=60)
    assert result2 == False, "Second lock should fail"
    print(f"✓ Second lock rejected (sync_id={sync_id_2})")
    
    # Verify first lock is still active
    lock_info = get_sync_lock(user_id)
    assert lock_info["sync_id"] == sync_id_1, "Original lock should still be active"
    print(f"✓ Original lock still active: {lock_info['sync_id']}")
    
    # Clean up
    release_sync_lock(user_id)
    print("✅ TEST 2 PASSED\n")


def test_concurrent_users():
    """Test 3: Different users don't block each other"""
    print("=" * 60)
    print("TEST 3: Concurrent users (no cross-blocking)")
    print("=" * 60)
    
    user_id_1 = "test-user-3"
    user_id_2 = "test-user-4"
    sync_id_1 = "sync-004"
    sync_id_2 = "sync-005"
    
    # Clean up
    release_sync_lock(user_id_1)
    release_sync_lock(user_id_2)
    
    # Both users should be able to acquire locks
    result1 = acquire_sync_lock(user_id_1, sync_id_1, ttl_seconds=60)
    result2 = acquire_sync_lock(user_id_2, sync_id_2, ttl_seconds=60)
    
    assert result1 == True, "User 1 should acquire lock"
    assert result2 == True, "User 2 should acquire lock"
    print(f"✓ User 1 locked: {is_sync_locked(user_id_1)}")
    print(f"✓ User 2 locked: {is_sync_locked(user_id_2)}")
    
    # Verify both locks are active
    lock1 = get_sync_lock(user_id_1)
    lock2 = get_sync_lock(user_id_2)
    assert lock1["sync_id"] == sync_id_1
    assert lock2["sync_id"] == sync_id_2
    print("✓ Both locks active simultaneously")
    
    # Clean up
    release_sync_lock(user_id_1)
    release_sync_lock(user_id_2)
    print("✅ TEST 3 PASSED\n")


def test_expired_lock():
    """Test 4: Expired lock can be replaced"""
    print("=" * 60)
    print("TEST 4: Expired lock replacement")
    print("=" * 60)
    
    user_id = "test-user-5"
    sync_id_1 = "sync-006"
    sync_id_2 = "sync-007"
    
    # Clean up
    release_sync_lock(user_id)
    
    # Acquire lock with very short TTL
    result1 = acquire_sync_lock(user_id, sync_id_1, ttl_seconds=1)
    assert result1 == True, "First lock should succeed"
    print(f"✓ First lock acquired with 1s TTL")
    
    # Wait for lock to expire
    import time
    time.sleep(2)
    
    # Lock should be expired now (is_sync_locked checks expiry)
    assert is_sync_locked(user_id) == False, "Lock should be expired"
    print("✓ Lock expired after TTL")
    
    # New lock should succeed
    result2 = acquire_sync_lock(user_id, sync_id_2, ttl_seconds=60)
    assert result2 == True, "New lock should succeed after expiry"
    print(f"✓ New lock acquired (sync_id={sync_id_2})")
    
    # Clean up
    release_sync_lock(user_id)
    print("✅ TEST 4 PASSED\n")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("SYNC LOCK TESTS")
    print("=" * 60 + "\n")
    
    # Initialize database
    init_db()
    print("✓ Database initialized\n")
    
    try:
        test_basic_lock()
        test_double_lock()
        test_concurrent_users()
        test_expired_lock()
        
        print("\n" + "=" * 60)
        print("🎉 ALL TESTS PASSED!")
        print("=" * 60 + "\n")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)

