namespace backend.Domain.Enums;

public enum JobStatus
{
    Queued,

    // chatbot Yes/No
    AwaitingUserInput,
    Running,
    Completed,
    Failed
}
