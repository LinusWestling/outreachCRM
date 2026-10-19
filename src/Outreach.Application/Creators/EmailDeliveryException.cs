namespace Outreach.Application.Creators;

public sealed class EmailDeliveryException(string message, Exception innerException) : Exception(message, innerException);
