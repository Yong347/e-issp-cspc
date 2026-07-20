class BusinessRuleViolation(ValueError):
    """
    Exception raised when an action or database update violates an active 
    ISSP business rule, budget ceiling constraint, or compliance policy.
    
    Inherits from ValueError to maintain backward-compatibility with validation 
    handlers while providing a distinct class name for explicit matching.
    """
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class DecryptionError(Exception):
    """
    Exception raised specifically when cryptographic decryption fails during 
    the parsing of EncryptedJSON database columns (e.g., due to key rotation mismatch, 
    incorrect salt evaluation, or payload corruption).
    """
    def __init__(self, message: str = "Cryptographic decryption failed. Data corruption or incorrect key detected."):
        self.message = message
        super().__init__(message)