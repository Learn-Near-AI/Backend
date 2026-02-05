/**
 * Deployment service - wraps deploy-contract
 */
import {
  deployContract,
  callContract,
  viewContract,
  areCredentialsConfigured,
} from '../../deploy-contract.js';
import { ServiceUnavailableError, AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export function checkCredentials() {
  return areCredentialsConfigured();
}

export function getNearStatus() {
  const configured = areCredentialsConfigured();
  return {
    configured,
    accountId: configured ? process.env.NEAR_ACCOUNT_ID : null,
    network: process.env.NEAR_NETWORK || 'testnet',
    message: configured
      ? 'NEAR CLI is configured and ready'
      : 'NEAR CLI not configured. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables.',
  };
}

export async function deployWasm(wasmBase64, options = {}) {
  if (!areCredentialsConfigured()) {
    throw new ServiceUnavailableError(
      'NEAR CLI deployment not configured. Please set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables.'
    );
  }

  logger.info('Deploying contract via NEAR CLI');
  const wasmBuffer = Buffer.from(wasmBase64, 'base64');

  try {
    const result = await deployContract(wasmBuffer, {
      contractAccountId: options.contractAccountId,
      initMethod: options.initMethod || 'new',
      initArgs: options.initArgs || {},
    });
    return result;
  } catch (error) {
    const msg = error?.error || error?.message || 'Deployment failed';
    logger.error('Deployment failed', { error: msg });
    throw new AppError(msg, 500, 'DEPLOYMENT_FAILED');
  }
}

export async function callContractMethod(contractAccountId, methodName, args = {}, options = {}) {
  if (!areCredentialsConfigured()) {
    throw new ServiceUnavailableError(
      'NEAR CLI not configured. Please set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables.'
    );
  }

  logger.info(`Calling contract: ${contractAccountId}.${methodName}`);

  try {
    return await callContract(contractAccountId, methodName, args, {
      accountId: options.accountId,
      deposit: options.deposit,
      gas: options.gas,
    });
  } catch (error) {
    const msg = error?.error || error?.message || 'Contract call failed';
    logger.error('Contract call failed', { error: msg });
    throw new AppError(msg, 500, 'CONTRACT_CALL_FAILED');
  }
}

export async function viewContractMethod(contractAccountId, methodName, args = {}) {
  if (!areCredentialsConfigured()) {
    throw new ServiceUnavailableError(
      'NEAR CLI not configured. Please set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables.'
    );
  }

  logger.info(`Viewing contract: ${contractAccountId}.${methodName}`);

  try {
    return await viewContract(contractAccountId, methodName, args);
  } catch (error) {
    const msg = error?.error || error?.message || 'Contract view failed';
    logger.error('Contract view failed', { error: msg });
    throw new AppError(msg, 500, 'CONTRACT_VIEW_FAILED');
  }
}
