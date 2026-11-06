namespace backend.Application.Interfaces;

/// <summary>The parts of Supabase Auth only the server may call.</summary>
public interface IAuthAdmin
{
    /// <summary>Delete the person's sign-in record. Not an error if it is already gone.</summary>
    Task DeleteUserAsync(Guid userId);
}
