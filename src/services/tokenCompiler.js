const solc = require('solc');
const path = require('path');
const fs = require('fs');

const OZ_BASE = path.join(__dirname, '../../node_modules');

function findImports(importPath) {
  const full = path.join(OZ_BASE, importPath);
  try {
    return { contents: fs.readFileSync(full, 'utf8') };
  } catch (e) {
    return { error: 'File not found: ' + full };
  }
}

// ─── Generate Solidity source based on token params + features ────────────────
function generateSource({ name, symbol, decimals, supply, features }) {
  const hasPausable  = features.includes('Pausable');
  const hasBurnable  = features.includes('Burnable Token');
  const hasMintable  = features.includes('Mintable');
  const hasWhitelist = features.includes('Whitelist');
  const hasTaxable   = features.includes('Taxable');
  const hasAnyFeature = hasPausable || hasBurnable || hasMintable || hasWhitelist || hasTaxable;

  // Sanitize contract name (must be valid Solidity identifier)
  const contractName = name.replace(/[^a-zA-Z0-9]/g, '') || 'MyToken';

  // ── Imports ────────────────────────────────────────────────────────────────
  const imports = [
    'import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";',
    'import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";',
    hasAnyFeature ? 'import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";' : '',
    hasBurnable   ? 'import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";' : '',
    hasPausable   ? 'import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";' : '',
  ].filter(Boolean).join('\n');

  // ── Inheritance ────────────────────────────────────────────────────────────
  const bases = [
    'ERC20',
    hasBurnable  ? 'ERC20Burnable'  : '',
    hasPausable  ? 'ERC20Pausable'  : '',
    hasAnyFeature ? 'AccessControl' : '',
    'ERC20Permit',
  ].filter(Boolean).join(', ');

  // ── Role constants ─────────────────────────────────────────────────────────
  const roles = [
    hasPausable  ? '    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");' : '',
    hasMintable  ? '    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");' : '',
    hasWhitelist ? '    bytes32 public constant WHITELIST_ROLE = keccak256("WHITELIST_ROLE");' : '',
  ].filter(Boolean).join('\n');

  // ── State variables ────────────────────────────────────────────────────────
  const stateVars = [
    hasWhitelist ? '    bool public whitelistActive = true;' : '',
    hasTaxable   ? '    address public taxWallet;'           : '',
    hasTaxable   ? '    uint256 public taxFeeBps = 200;'     : '',
  ].filter(Boolean).join('\n');

  // ── Constructor parameters ─────────────────────────────────────────────────
  const ctorParams = [
    'address recipient',
    hasAnyFeature ? 'address defaultAdmin' : '',
    hasPausable   ? 'address pauser'       : '',
    hasMintable   ? 'address minter'       : '',
    hasTaxable    ? 'address _taxWallet'   : '',
  ].filter(Boolean).join(', ');

  // ── Constructor base calls ─────────────────────────────────────────────────
  const ctorBases = `ERC20(${JSON.stringify(name)}, ${JSON.stringify(symbol)})\n        ERC20Permit(${JSON.stringify(name)})`;

  // ── Constructor body ───────────────────────────────────────────────────────
  const supplyWei = decimals === 18
    ? `${supply} * 10 ** decimals()`
    : `${supply} * 10 ** ${decimals}`;

  const ctorBody = [
    `        _mint(recipient, ${supplyWei});`,
    hasAnyFeature ? '        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);' : '',
    hasWhitelist  ? '        _grantRole(WHITELIST_ROLE, defaultAdmin);'     : '',
    hasPausable   ? '        _grantRole(PAUSER_ROLE, pauser);'              : '',
    hasMintable   ? '        _grantRole(MINTER_ROLE, minter);'              : '',
    hasTaxable    ? '        taxWallet = _taxWallet;'                        : '',
  ].filter(Boolean).join('\n');

  // ── Feature functions ──────────────────────────────────────────────────────
  const featureFunctions = [
    hasPausable ? `
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }` : '',

    hasMintable ? `
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }` : '',

    hasWhitelist ? `
    function setWhitelistActive(bool _active) public onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelistActive = _active;
    }` : '',

    hasTaxable ? `
    function setTaxWallet(address _newTaxWallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newTaxWallet != address(0), "Tax wallet cannot be zero address");
        taxWallet = _newTaxWallet;
    }` : '',
  ].filter(Boolean).join('\n');

  // ── decimals override ──────────────────────────────────────────────────────
  const decimalsOverride = decimals !== 18 ? `
    function decimals() public view override returns (uint8) {
        return ${decimals};
    }` : '';

  // ── _update override (only if Pausable or Whitelist or Taxable) ────────────
  let updateOverride = '';
  if (hasPausable || hasWhitelist || hasTaxable) {
    const overrideBases = ['ERC20', hasPausable ? 'ERC20Pausable' : ''].filter(Boolean).join(', ');

    let updateBody = '';
    if (hasWhitelist) {
      updateBody += `
        if (from != address(0) && whitelistActive) {
            require(hasRole(WHITELIST_ROLE, from), "Whitelist: Sender lacks role");
        }`;
    }
    if (hasTaxable) {
      updateBody += `
        if (from == address(0) || to == address(0) || hasRole(DEFAULT_ADMIN_ROLE, from) || from == taxWallet) {
            super._update(from, to, value);
            return;
        }
        uint256 taxAmount = (value * taxFeeBps) / 10000;
        uint256 amountAfterTax = value - taxAmount;
        if (taxAmount > 0) {
            super._update(from, taxWallet, taxAmount);
        }
        super._update(from, to, amountAfterTax);`;
    } else {
      updateBody += `
        super._update(from, to, value);`;
    }

    updateOverride = `
    function _update(address from, address to, uint256 value)
        internal
        override(${overrideBases})
    {${updateBody}
    }`;
  }

  return `// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.5.0
pragma solidity ^0.8.27;

${imports}

contract ${contractName} is ${bases} {
${roles}
${stateVars}

    constructor(${ctorParams})
        ${ctorBases}
    {
${ctorBody}
    }
${featureFunctions}
${decimalsOverride}
${updateOverride}
}`;
}

// ─── Compile token with selected features ─────────────────────────────────────
function compileToken({ name, symbol, decimals, supply, features }) {
  const source = generateSource({ name, symbol, decimals, supply, features });
  const contractName = name.replace(/[^a-zA-Z0-9]/g, '') || 'MyToken';

  const input = {
    language: 'Solidity',
    sources: { 'Token.sol': { content: source } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
      optimizer: { enabled: true, runs: 200 }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  const errors = (output.errors || []).filter(e => e.severity === 'error');
  if (errors.length > 0) {
    throw new Error('Compilation failed:\n' + errors.map(e => e.message).join('\n'));
  }

  const warnings = (output.errors || []).filter(e => e.severity === 'warning');
  if (warnings.length > 0) {
    console.log(`⚠️  [Compiler] ${warnings.length} warning(s) (non-fatal)`);
  }

  const contracts = output.contracts?.['Token.sol'];
  if (!contracts) throw new Error('No contracts in compilation output');

  const contractKey = Object.keys(contracts)[0];
  const compiled = contracts[contractKey];

  if (!compiled?.evm?.bytecode?.object) {
    throw new Error('No bytecode in compilation output');
  }

  return {
    bytecode: '0x' + compiled.evm.bytecode.object,
    abi: compiled.abi,
    source
  };
}

// ─── Determine fee based on creationCode size ─────────────────────────────────
// From official factory: if creationCode.length > 17050 bytes → 240 X1T, else 100 X1T
function calculateFee(creationCodeHex) {
  const bytes = (creationCodeHex.startsWith('0x') ? creationCodeHex.length - 2 : creationCodeHex.length) / 2;
  return bytes > 17050 ? 240n : 100n;
}

module.exports = { compileToken, generateSource, calculateFee };
