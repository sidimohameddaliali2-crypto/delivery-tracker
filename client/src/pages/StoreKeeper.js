import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Building2,
  Send,
  ArrowLeft,
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  Loader,
  QrCode,
  X,
  Flag,
  Info,
  Edit2,
  Trash2
} from 'lucide-react';
import { fetchBags } from '../store/slices/bagSlice';
import api from '../utils/api';
import SimpleQrScanner from '../components/SimpleQrScanner';

const appendStoreKeeperScanHistory = async (entry) => {
  try {
    await api.post('/store-keeper-scans', entry);
  } catch (error) {
    console.error('Failed to persist store keeper scan history:', error);
  }
};

// ===== EXTERNAL REDUCER FUNCTIONS (Outside component to prevent re-declaration) =====
const acquireBagLock = (lockedBagsRef, bagId) => {
  const now = Date.now();
  const expiredKeys = [];
  for (const [id, expiry] of lockedBagsRef.entries()) {
    if (now >= expiry) expiredKeys.push(id);
  }
  expiredKeys.forEach(id => lockedBagsRef.delete(id));
  const lockExpiry = lockedBagsRef.get(bagId);
  if (lockExpiry && now < lockExpiry) return false;
  lockedBagsRef.set(bagId, now + 2000); // 2-second lock (ULTRA-SHORT)
  return true;
};

const releaseBagLock = (lockedBagsRef, bagId) => {
  lockedBagsRef.delete(bagId);
};

const StoreKeeper = () => {
  const dispatch = useDispatch();
  const { bags = [] } = useSelector(state => state.bag || {});
  
  const [activeTab, setActiveTab] = useState('assign'); // 'assign', 'return', 'damaged', 'flagged'
  const [searchTerm, setSearchTerm] = useState('');
  const [flaggedSearchTerm, setFlaggedSearchTerm] = useState('');
  const [selectedBag, setSelectedBag] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [returnedBags, setReturnedBags] = useState([]);
  const [isAssignMode, setIsAssignMode] = useState(false); // Are we in assignment mode?
  const [selectedCompanyForAssignment, setSelectedCompanyForAssignment] = useState('');
  const [assignmentBags, setAssignmentBags] = useState([]); // Bags scanned in this session
  const [isReturnMode, setIsReturnMode] = useState(false); // Are we in return mode?
  const [isDamagedMode, setIsDamagedMode] = useState(false); // Are we in damaged scan mode?
  const [isStatusCheckMode, setIsStatusCheckMode] = useState(false); // Are we in status check mode?
  const [returnSessionBags, setReturnSessionBags] = useState([]); // Bags returned in this session
  const [damageSessionReports, setDamageSessionReports] = useState([]); // Damage reports in this session
  const [selectedDamagedBag, setSelectedDamagedBag] = useState(null);
  const [damageDescription, setDamageDescription] = useState('');
  const [damageSeverity, setDamageSeverity] = useState('moderate');
  const [damagePhotoFile, setDamagePhotoFile] = useState(null);
  const [damagePhotoPreview, setDamagePhotoPreview] = useState('');
  const [isUploadingDamagePhoto, setIsUploadingDamagePhoto] = useState(false);
  const [isSubmittingDamage, setIsSubmittingDamage] = useState(false);
  const [statusCheckResults, setStatusCheckResults] = useState([]); // Recent bag status checks
  const [flaggedBags, setFlaggedBags] = useState([]); // Flagged bags for override
  const [showQuantityOverride, setShowQuantityOverride] = useState(null); // Bag ID with override modal open
  const [overrideQuantity, setOverrideQuantity] = useState(''); // New quantity value
  const [overrideReason, setOverrideReason] = useState(''); // Reason for override
  const [showEditFlag, setShowEditFlag] = useState(null); // Bag ID with edit flag modal open
  const [editFlagReason, setEditFlagReason] = useState(''); // Updated flag reason
  const [selectedFlaggedBag, setSelectedFlaggedBag] = useState(null); // Selected flagged bag for detail view
  const [selectedFlaggedBagSearch, setSelectedFlaggedBagSearch] = useState(''); // Search within flagged bag details
  const [savedCompanies, setSavedCompanies] = useState(() => {
    // Load companies from localStorage on mount
    const saved = localStorage.getItem('storeKeeperCompanies');
    return saved ? JSON.parse(saved) : ['Matter', 'Yellow Block', 'CookIt'];
  });
  const [batchCollectionMode, setBatchCollectionMode] = useState(false); // Batch collection enabled
  const [scanningStatus, setScanningStatus] = useState('ready'); // 'ready', 'collecting', 'processing'
  const [isProcessing, setIsProcessing] = useState(false); // Batch processing in progress
  const [lastScannedBagId, setLastScannedBagId] = useState(null); // For UI: show last scanned
  
  // BATCH PROCESSING: Refs to collect scans without immediate processing
  const messageTimeoutRef = React.useRef(null); // Auto-clear message timeout
  const lockedBagsRef = React.useRef(new Map());
  const scannedBagsRef = React.useRef([]); // Array of unique bag IDs collected during session
  const seenScansRef = React.useRef(new Set()); // Set to prevent duplicate QR codes in same session
  const lastScanTimeRef = React.useRef(0); // Throttle scanner frame processing (100ms = 10/sec max)
  
  // Memoized batch collection handler
  const collectBagScan = useCallback((bagId) => {
    // Quick duplicate check within same scan session
    if (seenScansRef.current.has(bagId)) {
      setMessage({ type: 'warning', text: `⚠️ ${bagId} already scanned` });
      return false;
    }
    
    // Add to collection
    seenScansRef.current.add(bagId);
    scannedBagsRef.current.push(bagId);
    setLastScannedBagId(bagId);
    console.log('✅ Collected bag:', bagId, 'Total:', scannedBagsRef.current.length);
    
    setMessage({ type: 'success', text: `✓ ${bagId} (${scannedBagsRef.current.length} scanned)` });
    // playSuccessSound(); // Disabled sound
    return true;
  }, []);

  // BATCH PROCESSING: Process all collected scans when scanner closes
  const processBatchAssignment = useCallback(async () => {
                          {showScanner && (
                            <SimpleQrScanner
                              key="qr-scanner"
                              onScan={handleQRScan}
                              constraints={{
                                facingMode: 'environment',
                                aspectRatio: 1
                              }}
                              styles={{
                                container: {
                                  width: '100%',
                                  height: '100%',
                                  borderRadius: '8px'
                                },
                                video: {
                                  objectFit: 'cover'
                                }
                              }}
                            />
                          )}
    let freshBags = [];
    
    try {
      // Fetch each bag individually by its bagId
      const bagPromises = scannedBagsRef.current.map(bagId => 
        api.get(`/bags?search=${bagId}&limit=1`)
          .then(res => res.data.data?.[0])
          .catch(err => {
            console.error(`Error fetching bag ${bagId}:`, err);
            return null;
          })
      );
      
      const results = await Promise.all(bagPromises);
      freshBags = results.filter(bag => bag !== null);
      
      console.log('✅ Fetched bags:', freshBags.length, 'out of', scannedBagsRef.current.length);
    } catch (fetchError) {
      console.error('⚠️ Error fetching bags:', fetchError);
      setMessage({ type: 'error', text: 'Error loading bags' });
      setIsProcessing(false);
      setScanningStatus('ready');
      return;
    }
    
    let successCount = 0;
    let failureCount = 0;

    try {
      console.log('📋 Fetched bags:', freshBags.map(b => ({ id: b.bagId, status: b.status })));
      console.log('🎯 Bags to assign:', scannedBagsRef.current);
      
      // Process each collected bag
      for (const bagId of scannedBagsRef.current) {
        try {
          console.log('🔍 Looking for bag:', bagId, 'Type:', typeof bagId);
          
          // Check if bag exists with exact match
          const exactMatch = freshBags.find(b => b.bagId === bagId);
          
          // Check if bag exists with case-insensitive match
          const caseInsensitiveMatch = freshBags.find(b => 
            b.bagId.toLowerCase() === bagId.toLowerCase()
          );
          
          // Check if bag exists with trimmed match
          const trimmedMatch = freshBags.find(b => 
            b.bagId.trim() === bagId.trim()
          );
          
          console.log('🔍 Match results:', {
            exactMatch: !!exactMatch,
            caseInsensitive: !!caseInsensitiveMatch,
            trimmed: !!trimmedMatch,
            scannedId: bagId,
            scannedLength: bagId.length,
            // Show first 5 bags that start with similar pattern
            similar: freshBags
              .filter(b => b.bagId.includes(bagId.substring(0, 8)))
              .slice(0, 5)
              .map(b => ({ id: b.bagId, len: b.bagId.length }))
          });
          
          const bag = exactMatch || caseInsensitiveMatch || trimmedMatch;
          
          if (!bag) {
            console.error('❌ Bag not found in system:', bagId);
            failureCount++;
            continue;
          }
          
          console.log('✅ Found bag:', bag.bagId, 'Status:', bag.status, 'ID:', bag._id);

          // Skip if already assigned
          if (bag.status === 'assigned') {
            console.warn('⚠️ Bag already assigned:', bagId);
            failureCount++;
            continue;
          }

          // Make API call for this bag
          console.log('📦 Assigning bag:', bagId, 'to company:', selectedCompanyForAssignment);
          const response = await api.patch(`/bags/${bag._id}/assign`, {
            driverId: 'store-keeper',
            customerId: `COMPANY_${selectedCompanyForAssignment}`,
            customerName: selectedCompanyForAssignment,
            notes: `Batch assigned by store keeper`
          });

          if (response.data.success) {
            console.log('✅ Successfully assigned:', bagId);
            successCount++;
          } else {
            console.error('❌ Assignment failed for:', bagId, response.data);
            failureCount++;
          }
        } catch (error) {
          console.error('❌ Error assigning bag:', bagId, error.message);
          failureCount++;
        }
      }

      // Play success sound after all assignments
      // if (successCount > 0) {
      //   playSuccessSound(); // Disabled sound
      // }

      // No need to fetch all bags - we fetch on-demand when scanning
      
      console.log('📊 Final results:', { successCount, failureCount, total: scannedBagsRef.current.length });
      
      setMessage({
        type: 'success',
        text: `✓ ${successCount}/${scannedBagsRef.current.length} bags assigned to ${selectedCompanyForAssignment}`
      });

      // Add to assignment history
      const newAssignment = {
        bagId: scannedBagsRef.current.join(', '),
        company: selectedCompanyForAssignment,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setAssignmentBags(prev => [...prev, newAssignment]);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error: ${successCount} assigned, ${failureCount} failed`
      });
    } finally {
      setIsProcessing(false);
      setScanningStatus('ready');
      // Reset batch refs
      scannedBagsRef.current = [];
      seenScansRef.current.clear();
    }
  }, [selectedCompanyForAssignment, bags, dispatch]);

  // BATCH PROCESSING for return mode
  const processBatchReturn = useCallback(async () => {
    console.log('🚀 processBatchReturn called', {
      bagsToProcess: scannedBagsRef.current.length,
      bagIds: scannedBagsRef.current
    });

    if (scannedBagsRef.current.length === 0) {
      setMessage({ type: 'info', text: 'No bags to return' });
      return;
    }

    setIsProcessing(true);
    setScanningStatus('processing');

    // OPTIMIZED: Fetch only the specific bags we scanned
    console.log('🔄 Fetching only scanned bags for return:', scannedBagsRef.current);
    let freshBags = [];
    
    try {
      // Fetch each bag individually by its bagId
      const bagPromises = scannedBagsRef.current.map(bagId => 
        api.get(`/bags?search=${bagId}&limit=1`)
          .then(res => res.data.data?.[0])
          .catch(err => {
            console.error(`Error fetching bag ${bagId}:`, err);
            return null;
          })
      );
      
      const results = await Promise.all(bagPromises);
      freshBags = results.filter(bag => bag !== null);
      
      console.log('✅ Fetched bags for return:', freshBags.length, 'out of', scannedBagsRef.current.length);
    } catch (fetchError) {
      console.error('⚠️ Error fetching bags:', fetchError);
      setMessage({ type: 'error', text: 'Error loading bags' });
      setIsProcessing(false);
      setScanningStatus('ready');
      return;
    }
    
    let successCount = 0;
    let failureCount = 0;

    try {
      console.log('📋 Fetched bags:', freshBags.map(b => ({ id: b.bagId, status: b.status })));
      
      // Process each collected bag
      for (const bagId of scannedBagsRef.current) {
        try {
          console.log('🔍 Looking for bag to return:', bagId);
          const bag = freshBags.find(b => 
            b.bagId === bagId || 
            b.bagId.toLowerCase() === bagId.toLowerCase() ||
            b.bagId.trim() === bagId.trim()
          );
          
          if (!bag) {
            console.error('❌ Bag not found in system:', bagId);
            failureCount++;
            continue;
          }

          console.log('✅ Found bag:', bag.bagId, 'Status:', bag.status);

          // Skip if not assigned
          if (bag.status === 'available') {
            console.warn('⚠️ Bag already available:', bagId);
            failureCount++;
            continue;
          }

          // Make API call for this bag
          console.log('📦 Returning bag:', bagId);
          const response = await api.patch(`/bags/${bag._id}/return`, {
            status: 'available',
            notes: `Batch returned by store keeper`
          });

          if (response.data.success) {
            console.log('✅ Successfully returned:', bagId);
            successCount++;
            setReturnedBags(prev => [...prev, bagId]);
          } else {
            console.error('❌ Return failed for:', bagId, response.data);
            failureCount++;
          }
        } catch (error) {
          console.error('❌ Error returning bag:', bagId, error.message);
          failureCount++;
        }
      }

      // Play success sound after all returns
      // if (successCount > 0) {
      //   playSuccessSound(); // Disabled sound
      // }

      // No need to fetch all bags - we fetch on-demand when scanning
      
      console.log('📊 Return results:', { successCount, failureCount, total: scannedBagsRef.current.length });

      setMessage({
        type: 'success',
        text: `✓ ${successCount}/${scannedBagsRef.current.length} bags returned`
      });

      // Add to return history
      const newReturn = {
        bagId: scannedBagsRef.current.join(', '),
        company: 'Multiple',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setReturnSessionBags(prev => [...prev, newReturn]);
    } catch (error) {
      console.error('❌ Return batch error:', error);
      setMessage({
        type: 'error',
        text: `Error: ${successCount} returned, ${failureCount} failed`
      });
    } finally {
      setIsProcessing(false);
      setScanningStatus('ready');
      // Reset batch refs
      scannedBagsRef.current = [];
      seenScansRef.current.clear();
    }
  }, [dispatch]);

  // DON'T fetch all bags on mount - we now fetch only what we need on-demand
  // This prevents loading 10k bags and freezing the page
  
  // Optional: Log bags state when it changes (for debugging)
  // useEffect(() => {
  //   console.log('📦 Bags state updated:', {
  //     count: bags.length,
  //     sample: bags.slice(0, 5).map(b => ({ id: b.bagId, status: b.status }))
  //   });
  // }, [bags]);

  // Save companies to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('storeKeeperCompanies', JSON.stringify(savedCompanies));
  }, [savedCompanies]);

  // Cleanup scanner when closing to prevent memory leaks
  useEffect(() => {
    return () => {
      if (showScanner) {
        setShowScanner(false);
      }
      // DON'T clear refs here - they need to persist for batch processing
      // Refs are cleared in processBatchAssignment's finally block after processing
      // Clear last scan time
      lastScanTimeRef.current = 0;
    };
  }, [showScanner]);

  // Auto-clear messages after 2 seconds to prevent stale UI state
  useEffect(() => {
    if (message) {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = setTimeout(() => {
        setMessage(null);
      }, 2000);
    }
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    };
  }, [message]);

  // Play success sound
  const playSuccessSound = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 1000; // 1000 Hz
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  };

  // Play error sound
  const playErrorSound = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 400; // 400 Hz
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  };

  useEffect(() => {
    // Only fetch bags for assign/return tab bag lists
    if (activeTab === 'assign' || activeTab === 'return') {
      dispatch(fetchBags({
        page: 1,
        limit: 50,
        status: activeTab === 'assign' ? 'available' : 'assigned'
      }));
    }
  }, [dispatch, activeTab]);

  useEffect(() => () => {
    if (damagePhotoPreview) {
      URL.revokeObjectURL(damagePhotoPreview);
    }
  }, [damagePhotoPreview]);

  const handleStartAssignment = (company) => {
    setIsStatusCheckMode(false);
    setIsAssignMode(true);
    setSelectedCompanyForAssignment(company);
    setAssignmentBags([]);
    setBatchCollectionMode(true); // Enable batch collection
    setScanningStatus('collecting');
    setShowScanner(true);
    scannedBagsRef.current = []; // Reset batch array
    seenScansRef.current.clear(); // Reset seen set
    lastScanTimeRef.current = 0; // Reset throttle
    setMessage({ 
      type: 'success', 
      text: `🎯 Scanning bags for ${company}. Close when done.` 
    });
  };

  const handleEndAssignment = async () => {
    // Disable batch collection
    setBatchCollectionMode(false);
    setShowScanner(false);
    
    // Call batch processing BEFORE clearing state (it needs selectedCompanyForAssignment)
    await processBatchAssignment();
    
    // Reset modes and UI AFTER processing
    setIsAssignMode(false);
    setSelectedCompanyForAssignment('');
  };

  const handleReturnBagFromCompany = async () => {
    if (!selectedBag) {
      setMessage({ type: 'error', text: 'Please select a bag' });
      return;
    }
    // For batch mode, just add to collection
    collectBagScan(selectedBag.bagId);
    setSelectedBag(null);
  };

  const handleStartReturnMode = () => {
    setIsStatusCheckMode(false);
    setIsReturnMode(true);
    setReturnSessionBags([]);
    setBatchCollectionMode(true); // Enable batch collection
    setScanningStatus('collecting');
    setShowScanner(true);
    scannedBagsRef.current = []; // Reset batch array
    seenScansRef.current.clear(); // Reset seen set
    lastScanTimeRef.current = 0; // Reset throttle
    setMessage({ 
      type: 'success', 
      text: `🎯 Scanning bags to return. Close when done.` 
    });
  };

  const handleEndReturnMode = async () => {
    // Disable batch collection and process
    setBatchCollectionMode(false);
    
    // Call batch processing
    await processBatchReturn();
    
    // Reset modes and UI
    setIsReturnMode(false);
    setShowScanner(false);
    
    setMessage({ 
      type: 'success', 
      text: `✓ ${returnSessionBags.length} sessions completed` 
    });
  };

  const resetDamageFormState = useCallback(() => {
    if (damagePhotoPreview) {
      URL.revokeObjectURL(damagePhotoPreview);
    }
    setSelectedDamagedBag(null);
    setDamageDescription('');
    setDamageSeverity('moderate');
    setDamagePhotoFile(null);
    setDamagePhotoPreview('');
    setIsUploadingDamagePhoto(false);
    setIsSubmittingDamage(false);
  }, [damagePhotoPreview]);

  const uploadDamageProofPhoto = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('image', file, `damage-${Date.now()}-${file.name || 'proof.jpg'}`);

    const response = await api.post('/upload/delivery-photo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000,
    });

    return response.data?.url;
  }, []);

  const handleDamagedBagScan = useCallback(async (scannedBagId) => {
    const normalizedBagId = String(scannedBagId || '').trim().toUpperCase();
    if (!normalizedBagId) {
      return;
    }

    if (!acquireBagLock(lockedBagsRef.current, normalizedBagId)) {
      return;
    }

    try {
      const response = await api.get(`/bags?search=${encodeURIComponent(normalizedBagId)}&limit=5`);
      const candidates = response.data?.data || [];
      const bag = candidates.find((item) => String(item.bagId || '').toUpperCase() === normalizedBagId) || candidates[0];

      if (!bag) {
        setMessage({ type: 'error', text: `Bag ${normalizedBagId} not found` });
        return;
      }

      setLastScannedBagId(bag.bagId);
      setSelectedDamagedBag(bag);
      setShowScanner(false);
      setMessage({ type: 'success', text: `Selected ${bag.bagId} for damage report` });

      void appendStoreKeeperScanHistory({
        timestamp: new Date().toISOString(),
        bagId: bag.bagId,
        action: 'damage_scan',
        source: 'store_keeper'
      });
    } catch (error) {
      console.error('Error resolving damaged bag scan:', error);
      setMessage({ type: 'error', text: `Failed to load ${normalizedBagId}` });
    } finally {
      releaseBagLock(lockedBagsRef.current, normalizedBagId);
    }
  }, []);

  const handleStartDamagedMode = () => {
    setActiveTab('damaged');
    setIsAssignMode(false);
    setIsReturnMode(false);
    setIsStatusCheckMode(false);
    setIsDamagedMode(true);
    setBatchCollectionMode(false);
    setScanningStatus('collecting');
    setShowScanner(true);
    setLastScannedBagId(null);
    seenScansRef.current.clear();
    lastScanTimeRef.current = 0;
    setMessage({
      type: 'success',
      text: '🎯 Scan a bag to report damage.'
    });
  };

  const handleEndDamagedMode = () => {
    setShowScanner(false);
    setIsDamagedMode(false);
    setBatchCollectionMode(false);
    seenScansRef.current.clear();
    lastScanTimeRef.current = 0;
  };

  const handleQRScan = useCallback((detectedCodes) => {
    // Only process if scanner is open and payload exists
    if (!showScanner || isProcessing || !detectedCodes || detectedCodes.length === 0) {
      return;
    }

    // ULTRA-LIGHT THROTTLE: 100ms = 10 scans/sec max (just to reduce frame processing)
    const now = Date.now();
    if (now - lastScanTimeRef.current < 100) {
      return;
    }
    lastScanTimeRef.current = now;

    const scannedBagId = detectedCodes[0].rawValue;

    if (isDamagedMode) {
      handleDamagedBagScan(scannedBagId);
      return;
    }

    if (isStatusCheckMode) {
      checkBagStatus(scannedBagId);
      return;
    }

    if (!batchCollectionMode) {
      return;
    }

    // Collect the scan (no API calls, just accumulate)
    const didCollect = collectBagScan(scannedBagId);
    if (didCollect) {
      const action = isAssignMode ? 'assign_scan' : isReturnMode ? 'return_scan' : 'scan';
      void appendStoreKeeperScanHistory({
        timestamp: new Date().toISOString(),
        bagId: String(scannedBagId).trim().toUpperCase(),
        action,
        source: 'store_keeper'
      });
    }
  }, [showScanner, batchCollectionMode, isProcessing, collectBagScan, isStatusCheckMode, checkBagStatus, isAssignMode, isReturnMode, isDamagedMode, handleDamagedBagScan]);

  const handleSubmitDamagedReport = async () => {
    if (!selectedDamagedBag?._id) {
      setMessage({ type: 'error', text: 'Please scan a bag first' });
      return;
    }

    if (!damagePhotoFile) {
      setMessage({ type: 'error', text: 'Proof photo is required' });
      return;
    }

    setIsSubmittingDamage(true);
    try {
      setIsUploadingDamagePhoto(true);
      const proofPhotoUrl = await uploadDamageProofPhoto(damagePhotoFile);
      setIsUploadingDamagePhoto(false);

      if (!proofPhotoUrl) {
        throw new Error('Photo upload did not return a URL');
      }

      const payload = {
        description: damageDescription.trim() || undefined,
        severity: damageSeverity,
        proofPhotoUrl,
      };

      const response = await api.patch(`/bags/${selectedDamagedBag._id}/mark-damaged`, payload);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to mark bag as damaged');
      }

      const reportEntry = {
        bagId: selectedDamagedBag.bagId,
        severity: damageSeverity,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setDamageSessionReports((prev) => [reportEntry, ...prev]);

      setMessage({ type: 'success', text: `✓ ${selectedDamagedBag.bagId} marked as damaged` });
      resetDamageFormState();
      handleEndDamagedMode();
      fetchFlaggedBags();
      dispatch(fetchBags({ page: 1, limit: 50, status: 'maintenance' }));
    } catch (error) {
      console.error('Error submitting damaged report:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || error.message || 'Failed to submit damage report'
      });
    } finally {
      setIsUploadingDamagePhoto(false);
      setIsSubmittingDamage(false);
    }
  };

  const resolveBagStatusDetails = (bag) => {
    if (!bag) {
      return { statusLabel: 'Unknown', statusDetail: 'Bag not found' };
    }

    const customerName = bag.assignedTo?.customer?.customerName;
    const hasCustomerAssignment = Boolean(customerName);
    const isClientSide = hasCustomerAssignment || bag.status === 'assigned' || bag.status === 'in_use' || bag.location === 'customer' || bag.location === 'driver';

    if (isClientSide) {
      return {
        statusLabel: 'With Client',
        statusDetail: customerName || 'Assigned'
      };
    }

    return {
      statusLabel: 'In Warehouse',
      statusDetail: 'Warehouse'
    };
  };

  async function checkBagStatus(scannedBagId) {
    if (!scannedBagId) return;

    const normalizedBagId = String(scannedBagId).trim().toUpperCase();

    try {
      const response = await api.get(`/bags?search=${encodeURIComponent(normalizedBagId)}&limit=5`);
      const candidates = response.data?.data || [];
      const bag = candidates.find((item) => String(item.bagId || '').toUpperCase() === normalizedBagId) || candidates[0];

      if (!bag) {
        setMessage({ type: 'error', text: `Bag ${normalizedBagId} not found` });
        return;
      }

      const { statusLabel, statusDetail } = resolveBagStatusDetails(bag);
      setLastScannedBagId(bag.bagId);
      setStatusCheckResults((prev) => [
        {
          bagId: bag.bagId,
          statusLabel,
          location: bag.location || 'unknown',
          customerName: bag.assignedTo?.customer?.customerName || 'N/A',
          statusDetail,
          scannedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        ...prev.filter((entry) => entry.bagId !== bag.bagId)
      ].slice(0, 15));

      void appendStoreKeeperScanHistory({
        timestamp: new Date().toISOString(),
        bagId: bag.bagId,
        action: 'status_check',
        result: statusLabel,
        detail: statusDetail,
        source: 'store_keeper'
      });

      setMessage({ type: 'success', text: `${bag.bagId}: ${statusLabel}` });
    } catch (error) {
      console.error('Error checking bag status:', error);
      setMessage({ type: 'error', text: `Failed to check ${normalizedBagId}` });
    }
  }

  const handleStartStatusCheck = () => {
    setIsAssignMode(false);
    setIsReturnMode(false);
    setIsStatusCheckMode(true);
    setBatchCollectionMode(false);
    setScanningStatus('collecting');
    setShowScanner(true);
    setLastScannedBagId(null);
    seenScansRef.current.clear();
    lastScanTimeRef.current = 0;
    setMessage({
      type: 'success',
      text: '🎯 Scan a bag to check if it is in warehouse or with client.'
    });
  };

  const handleEndStatusCheck = () => {
    setIsStatusCheckMode(false);
    setShowScanner(false);
    setBatchCollectionMode(false);
    seenScansRef.current.clear();
  };

  // Handle quantity override for flagged bags
  const handleQuantityOverride = async (bagId, oldQuantity) => {
    if (!overrideQuantity || isNaN(overrideQuantity) || overrideQuantity < 1) {
      setMessage({ type: 'error', text: 'Please enter a valid quantity' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.patch(`/bags/${bagId}/override-quantity`, {
        newQuantity: parseInt(overrideQuantity),
        reason: overrideReason || 'Manual override',
        changedByName: 'Store Keeper'
      });

      if (response.data.success) {
        setMessage({ 
          type: 'success', 
          text: `✓ Quantity updated from ${oldQuantity} to ${overrideQuantity}` 
        });
        setShowQuantityOverride(null);
        setOverrideQuantity('');
        setOverrideReason('');
        
        // Refresh flagged bags
        fetchFlaggedBags();
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: `Error updating quantity: ${error.response?.data?.message || error.message}` 
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch flagged bags on mount
  const fetchFlaggedBags = useCallback(async () => {
    try {
      const response = await api.get('/bags?isFlagged=true&limit=500');
      setFlaggedBags(response.data.data || []);
    } catch (error) {
      console.error('Error fetching flagged bags:', error);
    }
  }, []);

  // Fetch flagged bags on mount
  useEffect(() => {
    fetchFlaggedBags();
  }, [fetchFlaggedBags]);

  // Handle unflagging a bag
  const handleUnflagBag = async (bagId) => {
    if (!window.confirm('Are you sure you want to remove the flag from this bag?')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.patch(`/bags/${bagId}/unflag`);

      if (response.data.success) {
        setMessage({ 
          type: 'success', 
          text: '✓ Flag removed successfully' 
        });
        
        // Refresh flagged bags
        fetchFlaggedBags();
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: `Error removing flag: ${error.response?.data?.message || error.message}` 
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle updating flag reason
  const handleUpdateFlagReason = async (bagId) => {
    if (!editFlagReason?.trim()) {
      setMessage({ type: 'error', text: 'Please enter a flag reason' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.patch(`/bags/${bagId}/update-flag`, {
        flagReason: editFlagReason.trim()
      });

      if (response.data.success) {
        setMessage({ 
          type: 'success', 
          text: '✓ Flag reason updated successfully' 
        });
        setShowEditFlag(null);
        setEditFlagReason('');
        
        // Refresh flagged bags
        fetchFlaggedBags();
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: `Error updating flag: ${error.response?.data?.message || error.message}` 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredBags = bags.filter(bag =>
    bag.bagId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bag.assignedTo?.customer?.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 safe-area">
      {/* iOS-style Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 safe-area-top">
        <div className="px-4 py-3">
          <h1 className="text-lg font-semibold text-gray-900 text-center">Store Keeper</h1>
          <p className="text-xs text-gray-500 text-center">Manage bag assignments</p>
        </div>
      </div>

      {/* Tab Navigation - iOS Style */}
      <div className="sticky top-[68px] z-30 bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setActiveTab('assign');
              setSelectedBag(null);
              setSelectedDamagedBag(null);
              setIsDamagedMode(false);
              setIsStatusCheckMode(false);
              setMessage(null);
            }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'assign'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Package className="w-4 h-4 mx-auto mb-1" />
            <span className="text-xs">Assign Bags</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('return');
              setSelectedBag(null);
              setSelectedDamagedBag(null);
              setIsDamagedMode(false);
              setIsStatusCheckMode(false);
              setMessage(null);
            }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'return'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <ArrowLeft className="w-4 h-4 mx-auto mb-1" />
            <span className="text-xs">Return Bags</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('damaged');
              setSelectedBag(null);
              setIsDamagedMode(false);
              setIsStatusCheckMode(false);
              setMessage(null);
            }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'damaged'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <AlertCircle className="w-4 h-4 mx-auto mb-1" />
            <span className="text-xs">Damaged</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-4 pb-20">
        {/* Message Alert */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mb-4 p-3 rounded-lg flex items-start space-x-2 ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <p className={`text-sm font-medium ${
                message.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}>
                {message.text}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* QR Scanner Modal */}
        <AnimatePresence>
          {showScanner && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="bg-white rounded-2xl p-6 w-full max-w-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {isAssignMode
                        ? 'Scan Bag QR Code'
                        : isReturnMode
                        ? 'Scan Bag to Return'
                        : isDamagedMode
                        ? 'Scan Damaged Bag'
                        : isStatusCheckMode
                        ? 'Scan Bag Status'
                        : 'Scan Bag'}
                    </h2>
                    <p className="text-xs text-gray-600 mt-1">
                      {isAssignMode
                        ? `Assigned: ${assignmentBags.length}`
                        : isReturnMode
                        ? `Returned: ${returnSessionBags.length}`
                        : isDamagedMode
                        ? `Reported: ${damageSessionReports.length}`
                        : isStatusCheckMode
                        ? `Checked: ${statusCheckResults.length}`
                        : 'Scanned'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowScanner(false);
                      if (isAssignMode) {
                        handleEndAssignment();
                      } else if (isReturnMode) {
                        handleEndReturnMode();
                      } else if (isDamagedMode) {
                        handleEndDamagedMode();
                      } else if (isStatusCheckMode) {
                        handleEndStatusCheck();
                      }
                    }}
                    className="p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <div className="bg-gray-100 rounded-lg overflow-hidden mb-4 h-64 flex items-center justify-center">
                  {showScanner && (
                    <SimpleQrScanner
                      key="qr-scanner"
                      onScan={handleQRScan}
                      audio={false}
                      constraints={{
                        facingMode: 'environment',
                        aspectRatio: 1
                      }}
                      styles={{
                        container: {
                          width: '100%',
                          height: '100%',
                          borderRadius: '8px'
                        },
                        video: {
                          objectFit: 'cover'
                        }
                      }}
                    />
                  )}
                </div>

                {/* Last scanned indicator */}
                {lastScannedBagId && (
                  <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                    ✓ Last: {lastScannedBagId}
                  </div>
                )}

                {/* Immediate status feedback while scanning */}
                {isStatusCheckMode && statusCheckResults.length > 0 && (
                  <div className="mb-4 p-3 rounded-lg border border-indigo-200 bg-indigo-50">
                    <p className="text-xs text-indigo-700">Latest scan</p>
                    <p className="text-sm font-semibold text-gray-900">{statusCheckResults[0].bagId}</p>
                    <p className={`text-sm font-semibold ${statusCheckResults[0].statusLabel === 'In Warehouse' ? 'text-green-700' : 'text-orange-700'}`}>
                      {statusCheckResults[0].statusLabel}
                    </p>
                    <p className="text-xs text-gray-600">{statusCheckResults[0].statusDetail}</p>
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowScanner(false);
                    if (isAssignMode) {
                      handleEndAssignment();
                    } else if (isReturnMode) {
                      handleEndReturnMode();
                    } else if (isDamagedMode) {
                      handleEndDamagedMode();
                    } else if (isStatusCheckMode) {
                      handleEndStatusCheck();
                    }
                  }}
                  className="w-full py-2 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-gray-300"
                >
                  Done Scanning
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Check Results */}
        {statusCheckResults.length > 0 && !showScanner && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 bg-white border border-gray-200 rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">Bag Status Checks</p>
              <button
                onClick={() => setStatusCheckResults([])}
                className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {statusCheckResults.map((result) => (
                <div key={result.bagId} className="flex items-center justify-between rounded-lg border border-gray-100 p-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{result.bagId}</p>
                    <p className="text-xs text-gray-500">
                      {result.statusDetail || (result.customerName !== 'N/A' ? result.customerName : result.location)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${result.statusLabel === 'In Warehouse' ? 'text-green-700' : 'text-orange-700'}`}>
                      {result.statusLabel}
                    </p>
                    <p className="text-[11px] text-gray-400">{result.scannedAt}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Assign Bags Tab */}
        {activeTab === 'assign' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-4"
          >
            {/* Session Status */}
            {isAssignMode && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-green-50 border-2 border-green-300 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-green-900">
                      Assigning to: <span className="text-lg">{selectedCompanyForAssignment}</span>
                    </p>
                    <p className="text-xs text-green-700">Bags scanned: {assignmentBags.length}</p>
                  </div>
                  <button
                    onClick={handleEndAssignment}
                    className="px-3 py-1 bg-red-500 text-white rounded font-medium hover:bg-red-600 text-sm"
                  >
                    Done
                  </button>
                </div>
                <div className="space-y-1">
                  {assignmentBags.map((item, idx) => (
                    <p key={idx} className="text-xs text-green-800">
                      ✓ {item.bagId}
                    </p>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Assignment History */}
            {assignmentBags.length > 0 && !isAssignMode && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-50 border border-blue-200 rounded-lg p-4"
              >
                <p className="text-sm font-semibold text-blue-900 mb-3">
                  Today's Assignments: {assignmentBags.length}
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {assignmentBags.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded">
                      <div>
                        <p className="font-semibold text-gray-900">{item.bagId}</p>
                        <p className="text-gray-600">{item.company}</p>
                      </div>
                      <p className="text-gray-500">{item.timestamp}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Company Selection for Assignment */}
            {!isAssignMode && (
              <div className="space-y-3">
                <button
                  onClick={handleStartStatusCheck}
                  className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
                >
                  <Info className="w-5 h-5" />
                  <span>Check Bag Status</span>
                </button>
                <p className="text-sm font-medium text-gray-700">Select Company to Assign Bags</p>
                <div className="grid grid-cols-1 gap-2">
                  {savedCompanies.map(company => (
                    <motion.button
                      key={company}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleStartAssignment(company)}
                      className="w-full py-4 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold flex items-center justify-between transition-all shadow-md"
                    >
                      <span>{company}</span>
                      <QrCode className="w-5 h-5" />
                    </motion.button>
                  ))}
                </div>

                {/* Custom Company Input */}
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Add New Company</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter company name..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          const newCompany = e.target.value.trim();
                          if (!savedCompanies.includes(newCompany)) {
                            setSavedCompanies([...savedCompanies, newCompany]);
                            setMessage({ 
                              type: 'success', 
                              text: `"${newCompany}" saved for future use` 
                            });
                          }
                          handleStartAssignment(newCompany);
                          e.target.value = '';
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling;
                        if (input.value.trim()) {
                          const newCompany = input.value.trim();
                          if (!savedCompanies.includes(newCompany)) {
                            setSavedCompanies([...savedCompanies, newCompany]);
                            setMessage({ 
                              type: 'success', 
                              text: `"${newCompany}" saved for future use` 
                            });
                          }
                          handleStartAssignment(newCompany);
                          input.value = '';
                        }
                      }}
                      className="px-3 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 text-sm"
                    >
                      Start
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Return Bags Tab */}
        {activeTab === 'return' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-4"
          >
            {/* Return Session Status */}
            {isReturnMode && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-orange-900">
                      Returning Bags
                    </p>
                    <p className="text-xs text-orange-700">Bags returned: {returnSessionBags.length}</p>
                  </div>
                  <button
                    onClick={handleEndReturnMode}
                    className="px-3 py-1 bg-red-500 text-white rounded font-medium hover:bg-red-600 text-sm"
                  >
                    Done
                  </button>
                </div>
                <div className="space-y-1">
                  {returnSessionBags.map((item, idx) => (
                    <p key={idx} className="text-xs text-orange-800">
                      ✓ {item.bagId} (from {item.company})
                    </p>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Return History */}
            {returnSessionBags.length > 0 && !isReturnMode && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-orange-50 border border-orange-200 rounded-lg p-4"
              >
                <p className="text-sm font-semibold text-orange-900 mb-3">
                  Today's Returns: {returnSessionBags.length}
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {returnSessionBags.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded">
                      <div>
                        <p className="font-semibold text-gray-900">{item.bagId}</p>
                        <p className="text-gray-600">{item.company}</p>
                      </div>
                      <p className="text-gray-500">{item.timestamp}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Search Bar */}
            {!isReturnMode && (
              <div className="relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search bag ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* QR Scanner Button for Batch Return */}
            {!isReturnMode && (
              <button
                onClick={handleStartReturnMode}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
              >
                <QrCode className="w-5 h-5" />
                <span>Scan Bags to Return</span>
              </button>
            )}

            {/* Selected Bag Card */}
            {selectedBag && !isReturnMode && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border-2 border-blue-200 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Selected Bag</p>
                    <p className="text-xl font-bold text-gray-900">{selectedBag.bagId}</p>
                  </div>
                  <button
                    onClick={() => setSelectedBag(null)}
                    className="p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                {selectedBag.assignedTo?.customer && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600">Currently with</p>
                    <p className="font-semibold text-gray-900">
                      {selectedBag.assignedTo.customer.customerName}
                    </p>
                  </div>
                )}

                {/* Return Button */}
                <button
                  onClick={handleReturnBagFromCompany}
                  disabled={isLoading}
                  className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      <span>Returning...</span>
                    </>
                  ) : (
                    <>
                      <ArrowLeft className="w-5 h-5" />
                      <span>Return to Available</span>
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {/* Bags List */}
            {!selectedBag && !isReturnMode && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Assigned Bags</p>
                {filteredBags.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No assigned bags found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredBags.map(bag => (
                      <motion.button
                        key={bag._id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedBag(bag)}
                        className="w-full p-3 bg-white border border-gray-200 rounded-lg text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <p className="font-semibold text-gray-900">{bag.bagId}</p>
                        <p className="text-xs text-gray-500">
                          {bag.assignedTo?.customer?.customerName || 'Unknown'} • {bag.condition || 'Unknown'} condition
                        </p>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Damaged Bags Tab */}
        {activeTab === 'damaged' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-4"
          >
            {!isDamagedMode && !selectedDamagedBag && (
              <button
                onClick={handleStartDamagedMode}
                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
              >
                <QrCode className="w-5 h-5" />
                <span>Scan Damaged Bag</span>
              </button>
            )}

            {selectedDamagedBag && (
              <div className="bg-white border border-red-200 rounded-xl p-4 space-y-4">
                <div>
                  <p className="text-xs text-gray-500">Selected Bag</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedDamagedBag.bagId}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                  <select
                    value={damageSeverity}
                    onChange={(e) => setDamageSeverity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <textarea
                    value={damageDescription}
                    onChange={(e) => setDamageDescription(e.target.value)}
                    rows={3}
                    placeholder="Describe the damage..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Proof Photo (required)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const nextFile = e.target.files?.[0] || null;
                      if (damagePhotoPreview) {
                        URL.revokeObjectURL(damagePhotoPreview);
                      }
                      setDamagePhotoFile(nextFile);
                      setDamagePhotoPreview(nextFile ? URL.createObjectURL(nextFile) : '');
                    }}
                    className="w-full text-sm"
                  />
                  {damagePhotoPreview && (
                    <img
                      src={damagePhotoPreview}
                      alt="Damage preview"
                      className="mt-3 w-full h-44 object-cover rounded-lg border border-gray-200"
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      resetDamageFormState();
                      handleStartDamagedMode();
                    }}
                    className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-semibold"
                    disabled={isSubmittingDamage || isUploadingDamagePhoto}
                  >
                    Scan Another
                  </button>
                  <button
                    onClick={handleSubmitDamagedReport}
                    disabled={!damagePhotoFile || isSubmittingDamage || isUploadingDamagePhoto}
                    className="py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white rounded-lg font-semibold"
                  >
                    {isUploadingDamagePhoto
                      ? 'Uploading...'
                      : isSubmittingDamage
                      ? 'Submitting...'
                      : 'Submit Report'}
                  </button>
                </div>
              </div>
            )}

            {damageSessionReports.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-red-900 mb-3">
                  Today Damage Reports: {damageSessionReports.length}
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {damageSessionReports.map((item, idx) => (
                    <div key={`${item.bagId}-${idx}`} className="flex items-center justify-between text-xs bg-white p-2 rounded">
                      <div>
                        <p className="font-semibold text-gray-900">{item.bagId}</p>
                        <p className="text-gray-600 capitalize">{item.severity}</p>
                      </div>
                      <p className="text-gray-500">{item.timestamp}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Flagged Bags Tab */}
        {activeTab === 'flagged' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-4"
          >
            {/* Search Bar for Flagged Bags */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by bag ID, customer name, or flag reason..."
                value={flaggedSearchTerm}
                onChange={(e) => setFlaggedSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {flaggedBags.filter(bag => {
              const searchLower = flaggedSearchTerm.toLowerCase();
              return (
                bag.bagId?.toLowerCase().includes(searchLower) ||
                bag.assignedTo?.customer?.customerName?.toLowerCase().includes(searchLower) ||
                bag.flagReason?.toLowerCase().includes(searchLower)
              );
            }).length === 0 ? (
              <div className="text-center py-8">
                <Flag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  {flaggedSearchTerm ? 'No flagged bags match your search' : 'No flagged bags'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {flaggedBags.filter(bag => {
                  const searchLower = flaggedSearchTerm.toLowerCase();
                  return (
                    bag.bagId?.toLowerCase().includes(searchLower) ||
                    bag.assignedTo?.customer?.customerName?.toLowerCase().includes(searchLower) ||
                    bag.flagReason?.toLowerCase().includes(searchLower)
                  );
                }).map(bag => (
                  <motion.button
                    key={bag._id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => setSelectedFlaggedBag(bag)}
                    className="w-full text-left bg-white border-2 border-red-300 rounded-lg p-4 space-y-3 hover:border-red-500 hover:shadow-lg transition-all"
                  >
                    {/* Bag ID and Flag Status */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-gray-600">Bag ID</p>
                        <p className="text-lg font-bold text-gray-900">{bag.bagId}</p>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-red-100 rounded-lg">
                        <Flag size={16} className="text-red-600" />
                        <span className="text-xs font-semibold text-red-700">Flagged</span>
                      </div>
                    </div>

                    {/* Flag Reason */}
                    {bag.flagReason && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Reason:</p>
                        <p className="text-sm text-gray-900 font-semibold">{bag.flagReason}</p>
                      </div>
                    )}

                    {/* Customer Assignment (Never disappears) */}
                    {bag.assignedTo?.customer && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">QR Code Assigned To:</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {bag.assignedTo.customer.customerName}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">(Assignment remains active until return)</p>
                      </div>
                    )}

                    {/* Current Quantity */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Current Quantity:</p>
                      <p className="text-2xl font-bold text-gray-900">{bag.quantity || 1}</p>
                    </div>

                    {/* Quantity History */}
                    {bag.quantityHistory && bag.quantityHistory.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-amber-900 mb-2">Quantity Changes:</p>
                        <div className="space-y-1">
                          {bag.quantityHistory.slice(-3).map((change, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="text-gray-700">
                                {change.oldQuantity} → {change.newQuantity}
                                {change.reason && ` (${change.reason})`}
                              </span>
                              <span className="text-gray-500">
                                {new Date(change.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-2">
                      {/* Override Quantity Button */}
                      <button
                        onClick={() => {
                          setShowQuantityOverride(bag._id);
                          setOverrideQuantity(bag.quantity?.toString() || '1');
                          setOverrideReason('');
                        }}
                        className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
                      >
                        <AlertCircle className="w-5 h-5" />
                        <span>Override Quantity</span>
                      </button>

                      {/* Edit and Remove Flag Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setShowEditFlag(bag._id);
                            setEditFlagReason(bag.flagReason || '');
                          }}
                          className="py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>Edit Flag</span>
                        </button>
                        <button
                          onClick={() => handleUnflagBag(bag._id)}
                          disabled={isLoading}
                          className="py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Remove Flag</span>
                        </button>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {/* Quantity Override Modal */}
            <AnimatePresence>
              {showQuantityOverride && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                >
                  <motion.div
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.9 }}
                    className="bg-white rounded-2xl p-6 w-full max-w-sm"
                  >
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Override Quantity</h2>

                    {/* Current and New Quantity Display */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Current</p>
                        <p className="text-3xl font-bold text-gray-900">
                          {flaggedBags.find(b => b._id === showQuantityOverride)?.quantity || 1}
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">New</p>
                        <input
                          type="number"
                          value={overrideQuantity}
                          onChange={(e) => setOverrideQuantity(e.target.value)}
                          className="w-full text-3xl font-bold bg-transparent text-blue-600 outline-none"
                          min="1"
                        />
                      </div>
                    </div>

                    {/* Reason Textarea */}
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Reason for Override (optional)
                      </label>
                      <textarea
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="e.g., Damage, Lost item, etc."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows="3"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowQuantityOverride(null);
                          setOverrideQuantity('');
                          setOverrideReason('');
                        }}
                        className="flex-1 px-4 py-3 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleQuantityOverride(showQuantityOverride, flaggedBags.find(b => b._id === showQuantityOverride)?.quantity || 1)}
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
                      >
                        {isLoading ? (
                          <>
                            <Loader className="w-5 h-5 animate-spin" />
                            <span>Updating...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            <span>Confirm Override</span>
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Edit Flag Modal */}
            <AnimatePresence>
              {showEditFlag && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                >
                  <motion.div
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.9 }}
                    className="bg-white rounded-2xl p-6 w-full max-w-sm"
                  >
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Flag Reason</h2>

                    {/* Bag Info */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                      <p className="text-xs text-gray-600 mb-1">Bag ID</p>
                      <p className="text-lg font-bold text-gray-900">
                        {flaggedBags.find(b => b._id === showEditFlag)?.bagId || 'Unknown'}
                      </p>
                    </div>

                    {/* Flag Reason Textarea */}
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Flag Reason *
                      </label>
                      <textarea
                        value={editFlagReason}
                        onChange={(e) => setEditFlagReason(e.target.value)}
                        placeholder="e.g., Damaged, Missing items, Wrong quantity, etc."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        rows="4"
                        autoFocus
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowEditFlag(null);
                          setEditFlagReason('');
                        }}
                        className="flex-1 px-4 py-3 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdateFlagReason(showEditFlag)}
                        disabled={isLoading || !editFlagReason?.trim()}
                        className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
                      >
                        {isLoading ? (
                          <>
                            <Loader className="w-5 h-5 animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            <span>Save Changes</span>
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Flagged Bag Detail Modal */}
            <AnimatePresence>
              {selectedFlaggedBag && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
                  onClick={() => {
                    setSelectedFlaggedBag(null);
                    setSelectedFlaggedBagSearch('');
                  }}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white rounded-2xl w-full max-w-2xl my-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 flex items-center justify-between rounded-t-2xl">
                      <div>
                        <h2 className="text-2xl font-bold text-white">Flagged Bag Details</h2>
                        <p className="text-red-100 mt-1">Bag ID: {selectedFlaggedBag.bagId}</p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedFlaggedBag(null);
                          setSelectedFlaggedBagSearch('');
                        }}
                        className="text-white hover:opacity-80 p-1 rounded transition"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    </div>

                    {/* Search Bar */}
                    <div className="p-4 border-b border-gray-200">
                      <div className="relative">
                        <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search details, reason, customer, quantity changes..."
                          value={selectedFlaggedBagSearch}
                          onChange={(e) => setSelectedFlaggedBagSearch(e.target.value)}
                          autoFocus
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
                      {/* Flag Reason */}
                      {selectedFlaggedBag.flagReason && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <p className="text-sm font-semibold text-red-700 mb-2">Flag Reason:</p>
                          <p className="text-gray-900">{selectedFlaggedBag.flagReason}</p>
                        </div>
                      )}

                      {/* Customer Assignment */}
                      {selectedFlaggedBag.assignedTo?.customer && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm font-semibold text-blue-700 mb-2">Assigned To:</p>
                          <p className="text-gray-900 font-semibold">{selectedFlaggedBag.assignedTo.customer.customerName}</p>
                          <p className="text-xs text-gray-500 mt-1">Assignment remains active until return</p>
                        </div>
                      )}

                      {/* Current Quantity */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Current Quantity:</p>
                        <p className="text-3xl font-bold text-gray-900">{selectedFlaggedBag.quantity || 1}</p>
                      </div>

                      {/* Quantity History */}
                      {selectedFlaggedBag.quantityHistory && selectedFlaggedBag.quantityHistory.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                          <p className="text-sm font-semibold text-amber-900 mb-3">Quantity Change History:</p>
                          <div className="space-y-2">
                            {selectedFlaggedBag.quantityHistory.map((change, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm bg-white border border-amber-100 rounded p-2">
                                <div>
                                  <span className="font-semibold text-gray-900">
                                    {change.oldQuantity} → {change.newQuantity}
                                  </span>
                                  {change.reason && (
                                    <p className="text-xs text-gray-600 mt-1">Reason: {change.reason}</p>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500">
                                  {new Date(change.timestamp).toLocaleDateString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 border-t border-gray-200 flex gap-3">
                      <button
                        onClick={() => {
                          setSelectedFlaggedBag(null);
                          setSelectedFlaggedBagSearch('');
                          setShowEditFlag(selectedFlaggedBag._id);
                          setEditFlagReason(selectedFlaggedBag.flagReason || '');
                        }}
                        className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span>Edit Flag</span>
                      </button>
                      <button
                        onClick={() => {
                          handleUnflagBag(selectedFlaggedBag._id);
                          setSelectedFlaggedBag(null);
                          setSelectedFlaggedBagSearch('');
                        }}
                        disabled={isLoading}
                        className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Remove Flag</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedFlaggedBag(null);
                          setSelectedFlaggedBagSearch('');
                        }}
                        className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-semibold transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default StoreKeeper;
