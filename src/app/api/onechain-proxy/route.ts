import { NextRequest, NextResponse } from 'next/server';

// Multiple RPC endpoints for fallback
const RPC_ENDPOINTS = [
  process.env.ONECHAIN_RPC_URL || 'https://rpc-testnet.onelabs.cc:443',
  'https://testnet-rpc.onechain.network',
  'https://rpc-testnet.onelabs.cc',
];

const TIMEOUT_MS = 15000; // 15 seconds timeout

async function tryRpcEndpoint(endpoint: string, body: any): Promise<Response> {
  console.log(`Trying OneChain RPC endpoint: ${endpoint}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OneRWA-Marketplace/1.0',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    let lastError: Error | null = null;
    
    // Try each RPC endpoint until one works
    for (const endpoint of RPC_ENDPOINTS) {
      try {
        const response = await tryRpcEndpoint(endpoint, body);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`OneChain RPC success with endpoint: ${endpoint}`);
          
          return NextResponse.json(data, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`OneChain RPC endpoint ${endpoint} failed:`, error instanceof Error ? error.message : error);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue; // Try next endpoint
      }
    }
    
    // All endpoints failed
    throw lastError || new Error('All RPC endpoints failed');
    
  } catch (error) {
    console.error('OneChain proxy error (all endpoints failed):', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to connect to OneChain network';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'OneChain RPC request timed out (all endpoints)';
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to any OneChain RPC server';
      } else {
        errorMessage = `OneChain RPC error: ${error.message}`;
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.message : 'Unknown error',
        triedEndpoints: RPC_ENDPOINTS,
        suggestion: 'OneChain testnet may be experiencing issues. Please try again later.'
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}