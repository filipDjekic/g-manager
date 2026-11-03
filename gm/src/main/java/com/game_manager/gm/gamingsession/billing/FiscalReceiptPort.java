package com.game_manager.gm.gamingsession.billing;
import java.util.UUID;
/** Implement only with a real fiscal provider. Internal ledger entries are never fiscal receipts. */
public interface FiscalReceiptPort {
    record IssuedReceipt(UUID operationId,String providerReceiptId,String verificationUrl) {}
    IssuedReceipt issue(UUID recordedOperationId);
}
